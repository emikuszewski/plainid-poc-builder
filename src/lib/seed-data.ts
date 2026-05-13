import type {
  PocDocument,
  Sprint,
  Persona,
  TrackerRow,
  ReferenceDoc,
  UseCaseLibraryEntry,
} from '../types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

// ============================================================
// Use Case Library — seeded from TI POC v2 + general patterns
// ============================================================

export const SEED_USE_CASES: Omit<UseCaseLibraryEntry, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    title: 'Data Layer Authorization — Databricks & SQL Sources',
    category: 'Data',
    persona: 'Data Domain Owner / Data Engineer',
    description:
      'SQL Authorizer intercepts queries against Databricks and SQL datasources with row/column filtering driven by user attributes.',
    objectives: [
      "Demonstrate that PlainID's SQL Authorizer can intercept and authorize queries against Databricks and traditional SQL datasources without modifying application code",
      'Show row-level and column-level filtering based on user attributes (e.g., department, clearance level, geography) sourced from IdP/AD/LDAP',
      'Prove that a policy change (e.g., revoking a data domain) propagates in real time without requiring a service restart or redeployment',
    ].join('\n'),
    successCriteria: [
      'SQL Authorizer successfully deployed and receiving query traffic from at least one Databricks and one SQL datasource',
      'Authorization decisions correctly enforce row/column filtering based on test user attributes from at least two identity sources',
      'Policy modification in PAP reflects in live query results within the PDP cache refresh window (no code changes required)',
      'Audit log captures all authorization decisions with requestor identity, resource accessed, policy matched, and decision outcome',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'Denodo Data Virtualization Authorization',
    category: 'Data',
    persona: 'Data Domain Owner / Data Platform Architect',
    description:
      'Enforce PBAC policies on Denodo virtualized views via SQL Authorizer passthrough or native Denodo integration.',
    objectives: [
      'Validate that PlainID can enforce access policies on the Denodo virtual data layer — either via SQL Authorizer passthrough or native Denodo integration',
      'Confirm that virtualized views respect the same PBAC policies as direct database access, eliminating authorization inconsistency across access paths',
      'Evaluate push-down authorization logic vs. post-query filtering and determine the optimal pattern for the environment',
    ].join('\n'),
    successCriteria: [
      'Denodo-connected data access is subject to PlainID authorization decisions — at least one virtual view with attribute-based access control validated',
      'Same policy governs access whether data is accessed through Denodo virtualization or direct SQL connection',
      'No authorization logic is embedded in Denodo views or custom VQL — policy is managed exclusively in PlainID PAP',
      'Performance impact of authorization overhead is measured and documented for production sizing',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'API Gateway Authorization — Apigee',
    category: 'API Gateway',
    persona: 'Platform Administrator / Application Owner',
    description:
      'PlainID acts as the fine-grained authorization decision point behind Apigee, with no authorization logic in backend services.',
    objectives: [
      "Prove that PlainID serves as the authorization decision point behind Apigee, handling fine-grained access control beyond Apigee's native capabilities (rate limiting, API key validation, basic role checks)",
      'Validate that integrating PlainID with Apigee does not require embedding authorization logic into backend services behind the gateway',
      'Demonstrate a policy change in PlainID PAP propagating to API enforcement without Apigee policy redeployment',
    ].join('\n'),
    successCriteria: [
      'Apigee successfully routes authorization callouts to PlainID PDP via PAA; at least two API endpoints governed by PBAC policies',
      'Fine-grained access decisions (e.g., resource-level access based on user role + data classification) are enforced at the gateway layer',
      'Backend services have no embedded authorization logic — all decisions originate from PlainID',
      "Latency overhead of PlainID authorization callout is measured and falls within acceptable thresholds for the customer's SLA requirements",
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'API Gateway Authorization — Generic (Kong / AWS API GW / Azure APIM)',
    category: 'API Gateway',
    persona: 'Platform Administrator / Application Owner',
    description:
      'PlainID PDP integrated with any modern API gateway via callout/plugin pattern for fine-grained authorization.',
    objectives: [
      'Prove that PlainID can serve as the authorization decision point behind any modern API gateway via callout or plugin integration',
      'Validate that gateway-level fine-grained authorization removes the need to embed authorization logic in backend services',
      'Demonstrate that a policy change in PlainID PAP propagates to API enforcement without gateway redeployment',
    ].join('\n'),
    successCriteria: [
      'API Gateway successfully routes authorization callouts to PlainID PDP via PAA; at least two API endpoints governed by PBAC policies',
      'Fine-grained access decisions enforced at the gateway layer based on user role, attributes, and resource classification',
      'Latency overhead measured and within acceptable SLA thresholds',
      'Audit trail of authorization decisions captured in PlainID',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'Role Consolidation & Policy Migration',
    category: 'Identity',
    persona: 'Platform Administrator / IAM Lead',
    description:
      'Inventory and rationalize legacy roles, then migrate to dynamic PBAC policies with phased federation.',
    objectives: [
      'Demonstrate how existing roles (from AD, IGA, LDAP) are inventoried, rationalized, and modeled as PBAC policies in PlainID',
      'Show how PlainID supports a phased migration from role-based access to dynamic, attribute-based policies without a hard cutover',
      "Validate that role definitions can be created and managed through PlainID's PAP UI, with delegated administration per data domain or application",
    ].join('\n'),
    successCriteria: [
      'At least one legacy role hierarchy successfully mapped to a set of PBAC policies in the PlainID PAP',
      'Policy federation model demonstrated — domain owners can manage policies within their scope without accessing other domains',
      'Role creation, modification, and deactivation workflows are documented and executable by a non-technical domain owner',
      'IGA integration validated as a role/entitlement data source feeding into PlainID PIP for dynamic group resolution',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'End-User Access Experience & Real-Time Policy Enforcement',
    category: 'Application',
    persona: 'End User / Data Consumer',
    description:
      'Seamless, consistent enforcement across systems with real-time policy revocation and clear denial behavior.',
    objectives: [
      'Demonstrate seamless, consistent data access across data platforms and connected applications — with authorization invisible to the user when access is permitted',
      'Validate that authorization policy changes take effect in real time without requiring user re-authentication or session restart',
      'Show access denial behavior: clear, actionable error responses when a user attempts to access data outside their policy scope',
    ].join('\n'),
    successCriteria: [
      'Test users in different attribute groups (department, region, classification level) receive correctly filtered data',
      'Real-time policy revocation takes effect within the PDP cache refresh window — confirmed with a timed access test',
      'Denied access returns a clear, consistent response; no sensitive data is leaked in error messages',
      'Integration with primary IdP confirmed — user context from JWT is correctly resolved and applied to authorization decisions',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'Compliance, Audit & Policy Governance',
    category: 'Compliance',
    persona: 'Auditor / Compliance Officer',
    description:
      'Every decision logged with full context; policy versioning and change history accessible from the PAP.',
    objectives: [
      "Demonstrate PlainID's audit log — every authorization decision is captured with full context: who, what, when, which policy, and the outcome",
      'Show how compliance teams can review and export policy configurations and decision history without requiring engineering support',
      'Validate that policy versioning and change history is maintained in the PAP, enabling audit trail for policy modifications',
    ].join('\n'),
    successCriteria: [
      'Audit log is queryable and exportable; at least 48 hours of decision history reviewed and validated for completeness',
      'Compliance persona can navigate PAP, run policy reports, and export access reviews without engineering involvement',
      'Policy change history (who changed what policy, when, and what was the previous state) is accessible from the PAP UI',
      'Audit output is sufficient to answer a sample SOX/CCPA access review question without requiring a custom report',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'AI Authorization — LangChain / LangGraph Agentic Workflows',
    category: 'AI Authorization',
    persona: 'AI Platform Owner / Application Developer',
    description:
      'Authorization decisions enforced inside LangChain/LangGraph agent workflows — controlling tool invocation, RAG retrieval, and downstream API calls.',
    objectives: [
      "Demonstrate PlainID's ability to enforce authorization at multiple gates within an agentic workflow: tool selection, RAG retrieval, and downstream API/data access",
      'Validate that the same PBAC policies governing human users also govern AI agents acting on their behalf',
      'Show MCP Tool Control patterns — restricting which tools an agent can invoke based on the calling user identity and context',
    ].join('\n'),
    successCriteria: [
      'LangChain Authorizer integrated; at least one agent workflow demonstrates per-tool and per-call authorization decisions',
      'RAG retrieval gated by row/column-level policies — agent cannot return data the calling user is not authorized to see',
      'Tool tier enforcement validated — different user roles see different available tool sets within the same agent',
      'Audit trail captures full chain of authorization decisions across the agent workflow for a single user request',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'AI Authorization — MCP Server / Tool Control',
    category: 'AI Authorization',
    persona: 'AI Platform Owner / Security Architect',
    description:
      'PlainID enforces authorization gates on MCP server tool invocations — controlling tool discovery, invocation, and parameter scope.',
    objectives: [
      'Validate that PlainID can enforce authorization at the MCP protocol layer — controlling which tools are exposed, which can be invoked, and with what parameter scope',
      'Demonstrate three-gate authorization model: tool list filtering, tool invocation authorization, and downstream resource authorization',
      'Show that the same identity context (JWT/OIDC) drives consistent decisions across MCP and traditional API access',
    ].join('\n'),
    successCriteria: [
      'MCP Authorizer deployed; tool list response filtered per calling identity',
      'Tool invocation gated by PlainID PDP — unauthorized invocations rejected with clear error',
      'Parameter-level authorization demonstrated (e.g., user can call a search tool but only against authorized data scopes)',
      'Audit trail of all MCP authorization decisions captured for security review',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'Application-Level Authorization — Java SDK / Spring Security',
    category: 'Application',
    persona: 'Application Owner / Developer',
    description:
      'Java SDK integration via Spring Security to enforce fine-grained authorization decisions inside application code.',
    objectives: [
      'Validate that the PlainID Java SDK integrates cleanly with Spring Security for in-app fine-grained authorization decisions',
      'Demonstrate that authorization logic is fully externalized — no business rules embedded in application code',
      'Show that policy updates in PAP are picked up by the application without redeployment',
    ].join('\n'),
    successCriteria: [
      'Spring application successfully integrated with PlainID Java SDK; at least two protected endpoints governed by PBAC policies',
      'Authorization decisions reflect real-time policy state — no stale decisions after policy update',
      'Performance overhead measured and within acceptable thresholds',
      'Developer experience documented — clear pattern for adding new protected resources',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'Delegated Account Access (Banking / Financial Services)',
    category: 'Application',
    persona: 'End User / Account Holder / Delegated User',
    description:
      'Account holders see all owned accounts; delegated users see only the specific accounts explicitly delegated to them.',
    objectives: [
      'Demonstrate that account ownership and delegated access can be modeled as PBAC policies in PlainID',
      'Validate that the same API endpoint returns different result sets based on the calling user identity and their delegation relationships',
      'Show that delegation can be added or revoked in real time and immediately reflects in the data the delegated user sees',
    ].join('\n'),
    successCriteria: [
      'Account owner persona sees all owned accounts; delegated user persona sees only delegated accounts',
      'Delegation revocation takes effect within the PDP cache refresh window',
      'No backend code changes required to add new delegation patterns — handled entirely as policy changes',
      'Audit log captures full delegation grant/revoke history',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'HCM Application Authorization — Sensitivity Tier Enforcement',
    category: 'Application',
    persona: 'HR Domain Owner / HRBP / Manager / Compliance Officer',
    description:
      'Multi-level HR data sensitivity classification enforced via PBAC policy — peer exclusions, manager exceptions, role-specific tier access.',
    objectives: [
      "Demonstrate PlainID's ability to enforce a multi-level HR data sensitivity classification (e.g., L1–L5) within HCM application workflows",
      'Validate that complex HR role matrix rules (peer exclusion, manager exceptions, enterprise aggregate overrides) can be externalized from HCM and managed as dynamic policies in PlainID PAP',
      'Prove that role-specific access controls can be driven by real-time policy decisions rather than static HCM role assignments',
    ].join('\n'),
    successCriteria: [
      'HCM successfully integrated with PlainID via SDK or REST API for real-time authorization decisions',
      'All target HR roles modeled as PBAC policies with dynamic sensitivity-tier filtering',
      'Peer exclusion enforced by policy evaluation rather than HCM configuration',
      'Manager exception rule validated — manager retains higher-tier access to direct reports despite peer exclusion',
      'Role-specific tier access demonstrated; DENY enforcement validated for restricted tiers',
    ].join('\n'),
    isSystem: true,
  },
  {
    title: 'Project-Based Access Management',
    category: 'Application',
    persona: 'Project Lead / Application Owner',
    description:
      'Access dynamically granted based on project membership; policy administration federated to project leads.',
    objectives: [
      'Demonstrate project-scoped access management where users gain and lose entitlements based on project membership',
      'Validate that project leads can manage access for their project without requiring central admin involvement',
      'Show location-based and residency-aware policy variants (data location, user location, residency)',
    ].join('\n'),
    successCriteria: [
      'At least one project modeled with dynamic membership-driven access',
      'Policy administration successfully federated to a non-platform-admin persona',
      'Location-aware policy variants demonstrated for at least one access scenario',
      'Audit trail of project membership changes and resulting access changes',
    ].join('\n'),
    isSystem: true,
  },
];

// ============================================================
// Default standard personas
// ============================================================

export const DEFAULT_PERSONAS: Omit<Persona, 'id'>[] = [
  {
    name: 'Platform Administrator',
    description:
      'Manages the PBAC platform, onboards new data sources and applications, reviews infrastructure health',
  },
  {
    name: 'Data Domain Owner',
    description:
      'Authors and governs access policies for specific data domains; collaborates with Data Engineers and Compliance',
  },
  {
    name: 'Application Owner',
    description:
      'Manages authorization policies for applications consuming data via virtualization layer or direct DB connections',
  },
  {
    name: 'Data Engineer / Developer',
    description: 'Integrates applications and data pipelines with the PBAC platform',
  },
  {
    name: 'Auditor / Compliance',
    description: 'Reviews policy configurations, decision logs, and access reports',
  },
  {
    name: 'End User',
    description: 'Data consumer whose access is governed by PBAC policies in real time',
  },
];

// ============================================================
// Default sprint structure
// ============================================================

export const DEFAULT_SPRINTS: Omit<Sprint, 'id'>[] = [
  { phase: 'Sprint 0', weeks: 'Week 1', focus: 'Environment provisioning, identity integration, kickoff workshop' },
  { phase: 'Sprint 1', weeks: 'Weeks 2–3', focus: 'Data Layer build, test, review' },
  { phase: 'Sprint 2', weeks: 'Weeks 4–5', focus: 'API Gateway + Role Consolidation' },
  { phase: 'Sprint 3', weeks: 'Week 6+', focus: 'Extended testing, KT, failure scenarios, POC review & close' },
];

// ============================================================
// Default tracker rows
// ============================================================

export const DEFAULT_TRACKER: Omit<TrackerRow, 'id'>[] = [
  { phase: 'Kickoff & Planning', task: 'Define POC scope, success criteria & key stakeholders', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Kickoff & Planning', task: 'Confirm in-scope data sources, APIs & systems', responsible: 'Customer', status: 'Not Started', dueDate: '' },
  { phase: 'Kickoff & Planning', task: 'Establish timeline, sprint milestones & responsibilities', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Kickoff & Planning', task: 'Set up communication channels (Slack/Teams) & escalation path', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Kickoff & Planning', task: 'Grant PlainID team access to customer POC environment', responsible: 'Customer', status: 'Not Started', dueDate: '' },
  { phase: 'Kickoff & Planning', task: 'Discovery: data sources, schemas, API catalog', responsible: 'Customer', status: 'Not Started', dueDate: '' },
  { phase: 'Kickoff & Planning', task: 'Discovery: IdP OIDC config, JWT structure, test tokens', responsible: 'Customer', status: 'Not Started', dueDate: '' },
  { phase: 'Kickoff & Planning', task: 'Architecture review session — infra, network, K8s details', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Environment Setup', task: 'Provision PlainID SaaS tenant (PAP)', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Environment Setup', task: 'Provision K8s cluster / namespace for PlainID components', responsible: 'Customer', status: 'Not Started', dueDate: '' },
  { phase: 'Environment Setup', task: 'Deploy PDP and PAA via Helm chart', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Environment Setup', task: 'Validate network connectivity to data sources & identity stores', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Integration', task: 'Configure PIP — primary IdP (OIDC/JWT)', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Integration', task: 'Configure PIP — directory / IGA sources', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Policy Modeling', task: 'Policy design workshop — map access requirements to PBAC policies', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Policy Modeling', task: 'Build sample policies for each use case', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Policy Modeling', task: 'Validate policy logic against test cases for each persona', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Testing', task: 'Execute use case validation against success criteria', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Testing', task: 'Test failure handling, cache, fallback, HA', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Testing', task: 'Performance / latency measurement under simulated load', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Knowledge Transfer', task: 'Train customer team on PAP: policy creation, management, versioning', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'Knowledge Transfer', task: 'Train customer team on monitoring, alerting, troubleshooting', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'POC Close', task: 'Review results against all use case success criteria', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'POC Close', task: 'Document key findings, gaps, and recommendations', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'POC Close', task: 'Deliver TCO model and implementation plan draft', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'POC Close', task: 'Introduction to PlainID Professional Services', responsible: 'PlainID', status: 'Not Started', dueDate: '' },
  { phase: 'POC Close', task: 'Present final POC outcomes and next steps', responsible: 'Customer + PlainID', status: 'Not Started', dueDate: '' },
];

// ============================================================
// Default reference docs
// ============================================================

export const DEFAULT_REFERENCE_DOCS: Omit<ReferenceDoc, 'id'>[] = [
  {
    title: 'PlainID Platform Architecture & Component Overview',
    url: 'https://docs.plainid.io/docs/about-the-platform',
    description: 'PAP, PDP, PIP, PEP, PAA interactions and deployment topology',
  },
  {
    title: 'PlainID Kubernetes Deployment Guide (Helm Chart)',
    url: 'https://docs.plainid.io/docs/kubernetes-deployment',
    description: 'Helm chart values, resource requirements, ingress configuration, secrets management',
  },
  {
    title: 'SQL Authorizer Integration — Databricks',
    url: 'https://docs.plainid.io/docs/databricks',
    description: 'Driver configuration, query interception, policy binding, performance tuning',
  },
  {
    title: 'SQL Authorizer Integration — General SQL Datasources',
    url: 'https://docs.plainid.io/docs/sql-database-authorizer',
    description: 'Generic SQL data source integration patterns',
  },
  {
    title: 'Apigee Authorizer Integration Guide',
    url: 'https://docs.plainid.io/docs/apigee',
    description: 'Callout configuration, token passing, PDP response handling, error behavior',
  },
  {
    title: 'PlainID Policy Information Point (PIP) Configuration',
    url: 'https://docs.plainid.io/docs/policy-information-point-pip-1',
    description: 'LDAP, REST, and OIDC PIP setup; attribute mapping and caching strategy',
  },
  {
    title: 'Audit Log & Compliance Reporting Guide',
    url: 'https://docs.plainid.io/docs/administration-guide',
    description: 'Log schema, query patterns, export options, sample compliance report templates',
  },
];

// ============================================================
// Empty POC factory
// ============================================================

/**
 * Build a fresh empty POC. When `catalogs` is provided (the live admin
 * defaults from DefaultsContext), tracker / personas / sprints / refDocs
 * come from there; otherwise the hardcoded seeds in this file are used.
 *
 * Currently only `tracker` is wired through (Bundle 1). The other catalogs
 * still seed from constants here until their admin tabs ship.
 */
export function emptyPoc(
  ownerEmail: string,
  catalogs?: {
    tracker?: TrackerRow[];
  },
): PocDocument {
  return {
    customerName: '',
    ownerEmail,
    status: 'draft',
    customerOverview: '',
    customerIndustry: '',
    customerHQ: '',
    compellingEvent: '',
    authorizationContext: '',
    objectives: '',
    whatToValidate: '',
    postPocDeliverables:
      'Total Cost of Ownership (TCO) model — including Authorizer licensing, implementation, and ongoing support\nInfrastructure requirements — cluster specs, networking, what the customer must provision\nImplementation plan — phased rollout aligned to customer timelines\nSkill set requirements for customer teams to operate and maintain the solution\nGap analysis — items requiring product roadmap alignment',
    inScopeSystems: [],
    identitySources: [],
    architectureConstraints: '',
    timelineSummary:
      'Scoped for a minimum of 6 weeks to allow sufficient time for environment setup, use-case sprint execution, testing, and knowledge transfer. Structured as 2-week sprints aligned to use-case clusters.',
    sprints: DEFAULT_SPRINTS.map((s) => ({ ...s, id: uid() })),
    cadence:
      'Weekly syncs (PlainID SE + customer POC team) throughout the engagement. Slack / Teams channel established for async Q&A and issue tracking. Two-week use-case sprints: Identify requirements → Build → Test → Review Success Criteria → Update Status.',
    personas: DEFAULT_PERSONAS.map((p) => ({ ...p, id: uid() })),
    teamMembers: [],
    useCases: [],
    customerResponsibilities: '',
    plainidResponsibilities: '',
    openItems: '',
    tracker: catalogs?.tracker ?? DEFAULT_TRACKER.map((t) => ({ ...t, id: uid() })),
    referenceDocs: DEFAULT_REFERENCE_DOCS.map((d) => ({ ...d, id: uid() })),
  };
}
