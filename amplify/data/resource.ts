import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { aiGenerate } from '../functions/ai-generate/resource';

/**
 * Data model:
 * - Poc: a full POC document. Owner can fully manage it; the rest of the team can read.
 * - UseCaseLibraryEntry: shared library of reusable use cases. Any signed-in user can
 *   create/read/update/delete entries (this is an internal team tool with mutual trust).
 * - UserPreferences: per-user flags (e.g. AI privacy notice acknowledged).
 * - AiUsageLog: minimal usage audit. Every aiGenerate call writes one row.
 *
 * Custom mutations:
 * - aiGenerate(prompt, system, maxTokens) — proxies to Bedrock through the
 *   ai-generate Lambda. Owner-only (the SE making the call).
 *
 * Entries are SNAPSHOTTED into a Poc at insertion time (the editor copies the entry
 * fields into the Poc.useCases JSON). Library updates do NOT propagate to existing POCs.
 */
const schema = a
  .schema({
    Poc: a
      .model({
        // Metadata
        customerName: a.string().required(),
        ownerEmail: a.string().required(),
        status: a.enum(['draft', 'active', 'completed']),

        // Section 1: Customer
        customerOverview: a.string(),
        customerIndustry: a.string(),
        customerHQ: a.string(),

        // Section 2: Authorization Context
        compellingEvent: a.string(),
        authorizationContext: a.string(),

        // Section 3: Objectives
        objectives: a.string(),
        whatToValidate: a.string(),
        postPocDeliverables: a.string(),

        // Section 4: Discovery (arrays stored as JSON strings)
        tenantStrategyChoice: a.string(),
        tenantStrategy: a.string(),
        inScopeSystems: a.json(),
        identitySources: a.json(),
        architectureConstraints: a.string(),
        outOfScope: a.string(),

        // Section 5: Timeline
        timelineSummary: a.string(),
        sprints: a.json(),

        // Section 6: Framework
        cadence: a.string(),
        personas: a.json(),
        teamMembers: a.json(),

        // Section 7: Use Cases (snapshotted from library)
        useCases: a.json(),

        // Section 8: Technical Foundation — POC-level identity & test users
        technicalFoundation: a.json(),

        // Section 9: Dependencies
        customerResponsibilities: a.string(),
        plainidResponsibilities: a.string(),
        openItems: a.string(),

        // Section 9: Tracker
        tracker: a.json(),

        // Section 10: Reference Docs
        referenceDocs: a.json(),
      })
      .authorization((allow) => [
        // Owner: full control over their own POC
        allow.owner().to(['create', 'read', 'update', 'delete']),
        // Team: read-only browse of every POC (for inspiration / onboarding)
        allow.authenticated().to(['read']),
      ]),

    UseCaseLibraryEntry: a
      .model({
        title: a.string().required(),
        category: a.string().required(),
        persona: a.string(),
        description: a.string(),
        objectives: a.string(),
        successCriteria: a.string(),
        isSystem: a.boolean(),
        createdBy: a.string(),
      })
      .authorization((allow) => [
        // Library is shared - team has full access. System entries are flagged via isSystem.
        allow.authenticated().to(['create', 'read', 'update', 'delete']),
      ]),

    /**
     * Minimal AI usage logging. One row per aiGenerate call.
     * Stores: who called, what feature, token counts, success/error, ISO timestamp.
     * Does NOT store the prompt or response text (privacy + storage).
     * Owner-only read so users can audit their own activity.
     */
    AiUsageLog: a
      .model({
        userEmail: a.string().required(),
        feature: a.string().required(), // 'field-suggest' | 'generate-use-cases' | 'review-poc'
        pocId: a.string(), // optional — link back to the POC the action ran on
        inputTokens: a.integer(),
        outputTokens: a.integer(),
        success: a.boolean().required(),
        errorMessage: a.string(),
        timestamp: a.string().required(), // ISO timestamp
      })
      .authorization((allow) => [allow.owner().to(['create', 'read'])]),

    /**
     * AI generation result type (for the custom mutation return).
     */
    AiGenerateResult: a.customType({
      text: a.string().required(),
      inputTokens: a.integer(),
      outputTokens: a.integer(),
      stopReason: a.string(),
    }),

    aiGenerate: a
      .mutation()
      .arguments({
        prompt: a.string().required(),
        system: a.string(),
        maxTokens: a.integer(),
        // Optional override of the Bedrock inference profile to invoke.
        // Defaults to BEDROCK_MODEL_ID env var (Sonnet 4.6) in the Lambda.
        // Allows per-feature model routing — e.g. Haiku 4.5 for Review POC
        // to fit under AppSync's 30s synchronous timeout while keeping
        // Sonnet for higher-quality features.
        modelId: a.string(),
      })
      .returns(a.ref('AiGenerateResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(aiGenerate)),

    /**
     * Async AI job — used for long-running operations like Review POC that
     * exceed AppSync's 30s synchronous resolver timeout.
     *
     * Lifecycle:
     *   1. Client calls `startAiJob` → creates a row with status='pending',
     *      returns jobId immediately. The Lambda is invoked asynchronously
     *      to do the actual Bedrock work.
     *   2. Client polls `AiJob` by id (or queries by pocId+feature for
     *      "latest review") to see when status flips to 'complete' or 'error'.
     *   3. On completion, the Lambda writes `result` (or `error`) and updates
     *      status. Old rows have a 30-day TTL — see backend.ts.
     *
     * Per-POC, per-feature semantics: the client picks "the latest job for
     * this POC + feature" to render icon state and result. Re-running creates
     * a new row; the old one ages out via TTL.
     */
    AiJob: a
      .model({
        ownerEmail: a.string().required(),
        feature: a.string().required(), // 'review-poc' (extensible to others later)
        pocId: a.string().required(),
        status: a.string().required(), // 'pending' | 'complete' | 'error'
        // Snapshot of inputs so the Lambda can run async without the client
        // staying connected. JSON-stringified to avoid schema explosion.
        promptJson: a.string().required(),
        // Filled in by the Lambda when the job completes.
        result: a.string(),
        errorMessage: a.string(),
        inputTokens: a.integer(),
        outputTokens: a.integer(),
        createdAt: a.string().required(), // ISO timestamp
        completedAt: a.string(),
        // DynamoDB TTL — unix epoch seconds. Set 30 days out at create time.
        ttl: a.integer(),
      })
      .authorization((allow) => [
        // Read-only for any authenticated user — clients filter by
        // ownerEmail to find their own jobs. The Lambda writes rows
        // directly through DynamoDB (not AppSync), so AppSync write
        // auth doesn't apply to job creation. Updates also happen via
        // direct DynamoDB writes from the Lambda.
        allow.authenticated().to(['read']),
      ]),

    /**
     * Start an async AI job. Returns the jobId immediately; the actual
     * Bedrock work happens in a separate Lambda invocation that writes
     * the result back to the AiJob row when done.
     */
    startAiJob: a
      .mutation()
      .arguments({
        feature: a.string().required(),
        pocId: a.string().required(),
        prompt: a.string().required(),
        system: a.string(),
        maxTokens: a.integer(),
        modelId: a.string(),
      })
      .returns(a.string()) // returns the new AiJob id
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(aiGenerate)),

    /**
     * Admin defaults — six shared catalogs the team curates together.
     *
     * When an SE creates a new POC, the seed values come from these models
     * instead of the hardcoded constants in seed-data.ts. The hardcoded
     * constants stay as fallback so the app keeps working when these tables
     * are empty (e.g. first-run before anyone has populated them).
     *
     * Deletion is soft (isDeleted=true) — existing POCs that snapshotted a
     * value at creation time aren't affected, and the audit log retains a
     * record of what changed.
     *
     * Authorization mirrors UseCaseLibraryEntry: any signed-in team member
     * can create / read / update / delete. Every write also produces an
     * AdminAuditLog row (written by the client at write time).
     */
    AdminDefaultTrackerTask: a
      .model({
        phase: a.string().required(),
        task: a.string().required(),
        responsible: a.string(), // e.g. "PlainID", "Customer", "Customer + PlainID"
        defaultStatus: a.string(), // "Not Started" | "In Progress" | "Completed" | "Blocked"
        sortOrder: a.integer().required(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    AdminDefaultResponsibility: a
      .model({
        kind: a.string().required(), // 'customer' | 'plainid'
        text: a.string().required(),
        sortOrder: a.integer().required(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    AdminDefaultPersona: a
      .model({
        name: a.string().required(),
        description: a.string(),
        sortOrder: a.integer().required(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    AdminDefaultReferenceDoc: a
      .model({
        title: a.string().required(),
        url: a.string().required(),
        description: a.string(),
        sortOrder: a.integer().required(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    AdminDefaultSprint: a
      .model({
        name: a.string().required(), // e.g. "Sprint 1 — Foundation"
        weeks: a.string(), // e.g. "Weeks 1-2"
        focus: a.string(),
        deliverables: a.string(), // newline-separated
        sortOrder: a.integer().required(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    /**
     * Free-form boilerplate strings keyed by name. Holds things like
     * default cadence text, default tenant-strategy paragraphs (one per
     * choice: customer / plainid / other), default timeline summary, etc.
     * Using a key/value table avoids a schema change every time we add
     * a new piece of seedable copy.
     */
    AdminDefaultBoilerplate: a
      .model({
        key: a.string().required(), // 'cadence' | 'tenantStrategy.customer' | etc.
        label: a.string().required(), // human-readable label for admin UI
        value: a.string(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    /**
     * In-scope system catalog entries. Each entry is a customer-facing
     * system label (Snowflake, Apigee, Databricks, …) with its category,
     * implied authorizer, and a default POC Focus paragraph. The picker
     * on the Discovery section reads from this catalog. Category values
     * mirror UseCaseCategory: 'Data' | 'API Gateway' | 'AI Authorization'
     * | 'Application'.
     */
    AdminDefaultSystemCatalogEntry: a
      .model({
        name: a.string().required(),
        category: a.string().required(),
        authorizerId: a.string().required(),
        defaultFocus: a.string().required(),
        sortOrder: a.integer().required(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    /**
     * Identity provider catalog entries. Each entry is an IdP product
     * label (Okta, Entra, Active Directory, SailPoint, …) with its
     * provider type, default IdentitySource.type value, and default
     * notes paragraph. The IdP picker on the Discovery section reads
     * from this catalog. providerType values: 'Cloud IdP' | 'Directory'
     * | 'IGA'.
     */
    AdminDefaultIdentityProviderEntry: a
      .model({
        name: a.string().required(),
        providerType: a.string().required(),
        defaultType: a.string().required(),
        defaultNotes: a.string().required(),
        sortOrder: a.integer().required(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    /**
     * PlainID team member catalog. Each entry is a named PlainIDer who can
     * be added to a POC via the Team section's "+ PlainID (pick)" picker.
     * Editable from the Admin → PlainID Team tab. Email is the lookup
     * key in practice (one row per person).
     */
    AdminDefaultPlainIdTeamMember: a
      .model({
        name: a.string().required(),
        email: a.string().required(),
        defaultRole: a.string().required(),
        sortOrder: a.integer().required(),
        isDeleted: a.boolean(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read', 'update', 'delete'])]),

    /**
     * Append-only audit log for all admin-defaults writes. Every create /
     * update / delete on an Admin* model writes one row here. Powers the
     * Admin → Activity tab. Authorization is broad (anyone can read +
     * create) because the whole team needs visibility.
     */
    AdminAuditLog: a
      .model({
        userEmail: a.string().required(),
        action: a.string().required(), // 'create' | 'update' | 'delete'
        modelName: a.string().required(), // e.g. 'AdminDefaultTrackerTask'
        recordId: a.string().required(),
        // Short human-readable description for the activity feed, e.g.
        // 'Updated tracker task "Identify data domains"' or
        // 'Deleted persona "Data Steward"'.
        summary: a.string().required(),
        // JSON snapshot of the record after the change (full row for
        // create/update; the soft-deleted row for delete). Stored as a
        // string so we don't need a per-model union type.
        snapshotJson: a.string(),
        timestamp: a.string().required(), // ISO
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read'])]),
  })
  .authorization((allow) => [allow.resource(aiGenerate)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
