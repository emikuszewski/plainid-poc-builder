import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * Data model:
 * - Poc: a full POC document. Owner can fully manage it; the rest of the team can read.
 * - UseCaseLibraryEntry: shared library of reusable use cases. Any signed-in user can
 *   create/read/update/delete entries (this is an internal team tool with mutual trust).
 *
 * Entries are SNAPSHOTTED into a Poc at insertion time (the editor copies the entry
 * fields into the Poc.useCases JSON). Library updates do NOT propagate to existing POCs.
 */
const schema = a.schema({
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
      inScopeSystems: a.json(),
      identitySources: a.json(),
      architectureConstraints: a.string(),

      // Section 5: Timeline
      timelineSummary: a.string(),
      sprints: a.json(),

      // Section 6: Framework
      cadence: a.string(),
      personas: a.json(),
      teamMembers: a.json(),

      // Section 7: Use Cases (snapshotted from library)
      useCases: a.json(),

      // Section 8: Dependencies
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
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
