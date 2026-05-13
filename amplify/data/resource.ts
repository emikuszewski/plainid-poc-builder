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
  })
  .authorization((allow) => [allow.resource(aiGenerate)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
