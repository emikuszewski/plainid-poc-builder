// Core POC document schema - drives form, HTML, and DOCX generation

export interface InScopeSystem {
  id: string;
  name: string;
  focus: string;
  priority: 'P1' | 'P2' | 'P3';
}

export interface IdentitySource {
  id: string;
  name: string;
  type: string; // e.g. "Primary IdP", "IGA", "Directory"
  notes: string;
}

export interface Sprint {
  id: string;
  phase: string;
  weeks: string;
  focus: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
}

export interface TeamMember {
  id: string;
  org: string; // 'Customer' | 'PlainID' or actual org name
  name: string;
  role: string;
  email: string;
}

export interface UseCase {
  id: string;
  // libraryId is set when picked from library; null when authored ad-hoc
  // (snapshot at insertion - subsequent library edits do NOT propagate)
  libraryId: string | null;
  title: string;
  category: UseCaseCategory;
  persona: string;
  objectives: string; // multiline
  successCriteria: string; // multiline
  // Technical specs — conditional shape based on category. Always present
  // (auto-created when use case is added) but the relevant fields differ
  // by category. See TechnicalSpec below.
  technicalSpec?: TechnicalSpec;
}

// ============================================================
// Technical specifications per use case
// ============================================================

export interface UrlEntry {
  id: string;
  label: string;
  url: string;
  notes: string;
}

export interface UnknownableField {
  value: string;
  unknown: boolean;
}

export const emptyUF = (initial = ''): UnknownableField => ({ value: initial, unknown: false });

// Authorizer config attached to each use case. The selectedAuthorizerId points
// into the AUTHORIZER_CATALOG; "Other / Custom" lets the SE name an authorizer
// that's not in the catalog.
export interface AuthorizerSpec {
  selectedAuthorizerId: string; // catalog id, or 'custom'
  customAuthorizerName: UnknownableField;
  version: UnknownableField;
  deploymentTopology: UnknownableField; // Helm/K8s, Docker standalone, Lambda, etc.
  deploymentTarget: UnknownableField; // customer cluster, AWS account, Snowflake account, etc.
  pdpEndpoint: UnknownableField;
  identitySourcePaths: UnknownableField;
  networkPath: UnknownableField; // direct, PrivateLink, VPN
  credentialsLocation: UnknownableField; // AWS Secrets Manager, Vault, K8s secret, etc.
  credentialsProvisioner: UnknownableField; // who provisions
  enforcementMode: UnknownableField; // proxy/inline, native (target-system policies), SDK
  sampleRequestResponse: UnknownableField; // pre/post for query mod or token enrichment
  failureMode: UnknownableField; // fail-open / fail-closed / cache TTL
  performanceBudget: UnknownableField; // acceptable latency overhead
  requiredPipIntegrations: UnknownableField; // identity sources to wire first
  authorizerDocs: UrlEntry[]; // auto-populated from catalog, editable
  openItems: UnknownableField; // explicit TBDs
}

// Category-specific technical detail. Only one of the per-category blocks
// will be populated based on the use case's category.
export interface TechnicalSpec {
  authorizer: AuthorizerSpec;

  // Universal — applies regardless of category
  jwtSampleUrls: UrlEntry[]; // sample decoded JWT, payload structure
  identityAttributeCatalog: UnknownableField;
  testUserAccounts: UnknownableField;

  // Per-category blocks. Each is independently populated when the use case
  // matches the category. Stored together for simplicity.
  data?: DataSpec;
  apiGateway?: ApiGatewaySpec;
  aiAuth?: AiAuthSpec;
  application?: ApplicationSpec;
  identity?: IdentitySpec;
  compliance?: ComplianceSpec;
}

export interface DataSpec {
  catalogScope: UnknownableField; // tables, schemas, row counts
  classificationTaxonomy: UnknownableField; // L1-L5, PII tags, where stored
  classificationDocsUrls: UrlEntry[];
  sampleQueries: UnknownableField; // 3-5 representative queries
  connectionMethod: UnknownableField; // JDBC driver, pooler, service principal
  existingAccessControl: UnknownableField; // what's enforced today
  performanceBaseline: UnknownableField; // p50/p95
  dataResidencyConstraints: UnknownableField;
}

export interface ApiGatewaySpec {
  apiCatalogUrls: UrlEntry[]; // OpenAPI/Swagger URLs
  endpointResourceModel: UnknownableField; // path/query/body fields that drive auth
  authPatternToday: UnknownableField; // API key, OAuth, JWT pass-through, mTLS
  tokenFlow: UnknownableField; // issuer, claims, audience, lifetime
  gatewayVersion: UnknownableField; // Apigee X vs Edge, Kong OSS vs EE, etc.
  existingPolicies: UnknownableField; // rate limit, schema validation, leave-in-place
  backendTrustModel: UnknownableField; // zero-trust vs trust-the-gateway
  latencySla: UnknownableField; // current p99, acceptable PlainID overhead
}

export interface AiAuthSpec {
  agentTopology: UnknownableField; // single, supervisor, LangGraph state machine
  toolInventoryUrls: UrlEntry[]; // tool/function specs
  toolInventoryNotes: UnknownableField;
  callingIdentityPropagation: UnknownableField; // header pass-through, A2A
  ragSourcesInScope: UnknownableField; // vector DBs, corpus, classification
  agentRuntime: UnknownableField; // LangServe, FastAPI, Bedrock Agents
  mcpTransport: UnknownableField; // stdio, SSE, streamable HTTP; auth pattern
  llmProvider: UnknownableField; // model, key scope, data boundary
  failureModePolicy: UnknownableField; // refuse, retry constrained, fail to user
}

export interface ApplicationSpec {
  appArchitecture: UnknownableField; // monolith vs microservices, framework version
  resourceModel: UnknownableField; // entity hierarchy, ownership
  existingAuthorization: UnknownableField; // annotations, custom code, role tables
  sessionModel: UnknownableField; // stateful, JWT-only, refresh cadence
  buildDeploy: UnknownableField; // Maven/Gradle, CI/CD, dep approval process
  domainSpecificRules: UnknownableField; // HCM role matrix, residency rules, etc.
}

export interface IdentitySpec {
  // Identity & Compliance use a multi-select of "downstream authorizers"
  // (referencing other use cases' authorizer selections by use case id) rather
  // than picking their own authorizer. That selection is captured in the
  // AuthorizerSpec for these categories via downstreamAuthorizerUseCaseIds
  // in IdentitySpec/ComplianceSpec — keeping it in the per-category block
  // because Identity/Compliance often span multiple downstream PEPs.
  downstreamAuthorizerUseCaseIds: string[]; // ids of other use cases in this POC
  roleInventory: UnknownableField; // count by source, naming conventions
  groupMembershipVolume: UnknownableField; // biggest groups, nesting depth
  lifecycleIntegration: UnknownableField; // JML flows, propagation latency
  sourceOfTruthMapping: UnknownableField; // attribute -> authoritative system
  federationBoundaries: UnknownableField; // domains/realms, delegated admin
}

export interface ComplianceSpec {
  downstreamAuthorizerUseCaseIds: string[]; // ids of other use cases in this POC
  regulationSet: UnknownableField; // SOX, PCI-DSS, HIPAA, GDPR, CCPA, sector
  existingAuditPipeline: UnknownableField; // current reports, format requirements
  retentionRequirements: UnknownableField; // log retention, immutability, WORM
  sampleAuditQuestions: UnknownableField; // 3-5 real auditor questions
  reviewerPersonas: UnknownableField; // non-eng auditor, tooling, self-serve needs
}

export type UseCaseCategory =
  | 'Data'
  | 'API Gateway'
  | 'AI Authorization'
  | 'Identity'
  | 'Compliance'
  | 'Application'
  | 'Other';

export interface TrackerRow {
  id: string;
  phase: string;
  task: string;
  responsible: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
  dueDate: string;
}

export interface ReferenceDoc {
  id: string;
  title: string;
  url: string;
  description: string;
}

export interface PocDocument {
  id?: string;
  // Metadata
  customerName: string;
  ownerEmail: string;
  status: 'draft' | 'active' | 'completed';
  createdAt?: string;
  updatedAt?: string;

  // Section 1: Customer
  customerOverview: string;
  customerIndustry: string;
  customerHQ: string;

  // Section 2: Authorization Context & Compelling Event
  compellingEvent: string;
  authorizationContext: string;

  // Section 3: Objectives & Outcomes
  objectives: string;
  whatToValidate: string; // multiline list
  postPocDeliverables: string; // multiline list

  // Section 4: Discovery Summary
  inScopeSystems: InScopeSystem[];
  identitySources: IdentitySource[];
  architectureConstraints: string;

  // Section 5: Timeline
  timelineSummary: string;
  sprints: Sprint[];

  // Section 6: Framework
  cadence: string;
  personas: Persona[];
  teamMembers: TeamMember[];

  // Section 7: Use Cases
  useCases: UseCase[];

  // Section 8: Dependencies & Pre-reqs
  customerResponsibilities: string; // multiline
  plainidResponsibilities: string; // multiline
  openItems: string; // multiline

  // Section 9: Tracker
  tracker: TrackerRow[];

  // Section 10: Reference Documentation
  referenceDocs: ReferenceDoc[];
}

export interface UseCaseLibraryEntry {
  id?: string;
  title: string;
  category: UseCaseCategory;
  persona: string;
  objectives: string;
  successCriteria: string;
  description: string; // short description for library card
  isSystem?: boolean; // seeded entries from TI doc
  createdAt?: string;
  updatedAt?: string;
}

export interface SectionMeta {
  id: string;
  label: string;
  shortLabel: string;
}

export const SECTIONS: SectionMeta[] = [
  { id: 'customer', label: 'Customer', shortLabel: '01' },
  { id: 'context', label: 'Compelling Event', shortLabel: '02' },
  { id: 'objectives', label: 'Objectives', shortLabel: '03' },
  { id: 'discovery', label: 'Discovery', shortLabel: '04' },
  { id: 'usecases', label: 'Use Cases', shortLabel: '05' },
  { id: 'technical', label: 'Technical Foundation', shortLabel: '06' },
  { id: 'timeline', label: 'Timeline', shortLabel: '07' },
  { id: 'framework', label: 'Framework', shortLabel: '08' },
  { id: 'dependencies', label: 'Dependencies', shortLabel: '09' },
  { id: 'tracker', label: 'Tracker', shortLabel: '10' },
  { id: 'docs', label: 'Reference Docs', shortLabel: '11' },
];

// ============================================================
// Authorizer catalog — hardcoded list of PlainID authorizers
// per category. The "Other / Custom" entry is always present
// at the end so SEs can name an authorizer outside the catalog.
//
// docsUrl values point at docs.plainid.io pages and are used
// to auto-populate the authorizer's reference doc URLs when
// selected in the editor.
// ============================================================

export interface AuthorizerCatalogEntry {
  id: string;
  name: string;
  category: UseCaseCategory;
  enforcementMode: 'proxy' | 'native' | 'sdk' | 'plugin' | 'lambda' | 'mixed';
  shortDescription: string;
  docsUrl: string;
}

export const AUTHORIZER_CATALOG: AuthorizerCatalogEntry[] = [
  // ===== Data =====
  {
    id: 'sql-database-authorizer',
    name: 'SQL Database Authorizer',
    category: 'Data',
    enforcementMode: 'proxy',
    shortDescription: 'Real-time proxy for PostgreSQL, MSSQL, generic JDBC. Intercepts SQL and modifies queries inline.',
    docsUrl: 'https://docs.plainid.io/docs/sql-database-authorizer',
  },
  {
    id: 'sql-spring-boot-sdk',
    name: 'Java Spring Boot SDK (SQL)',
    category: 'Data',
    enforcementMode: 'sdk',
    shortDescription: 'Library that initiates SQL Authorizer calls from the application layer.',
    docsUrl: 'https://docs.plainid.io/docs/sql-database-authorizer',
  },
  {
    id: 'sql-dotnet-sdk',
    name: '.NET SDK (SQL)',
    category: 'Data',
    enforcementMode: 'sdk',
    shortDescription: '.NET library for app-layer SQL modification.',
    docsUrl: 'https://docs.plainid.io/docs/sql-database-authorizer',
  },
  {
    id: 'snowflake-authorizer',
    name: 'Snowflake Authorizer (Native Policy)',
    category: 'Data',
    enforcementMode: 'native',
    shortDescription: 'Generates native Snowflake row access + masking policies. Out-of-path enforcement.',
    docsUrl: 'https://docs.plainid.io/docs/sf-native-policy-support',
  },
  {
    id: 'databricks-authorizer',
    name: 'Databricks Authorizer (Native Policy)',
    category: 'Data',
    enforcementMode: 'native',
    shortDescription: 'Unity Catalog row filters and column masks via SQL UDFs. Out-of-path enforcement.',
    docsUrl: 'https://docs.plainid.io/docs/databricks-native-policy-support',
  },
  {
    id: 'bigquery-authorizer',
    name: 'Google BigQuery Authorizer',
    category: 'Data',
    enforcementMode: 'native',
    shortDescription: 'Row + column-level access for BigQuery datasets via PAA + foreign tables.',
    docsUrl: 'https://docs.plainid.io/docs/google-bigquery-data-source',
  },
  {
    id: 'denodo-authorizer',
    name: 'Denodo Data Authorizer',
    category: 'Data',
    enforcementMode: 'mixed',
    shortDescription: 'Authorization on Denodo virtualized views.',
    docsUrl: 'https://docs.plainid.io/docs/data-authorizers',
  },
  {
    id: 'data-service-sdk',
    name: 'Generic Data Service SDK',
    category: 'Data',
    enforcementMode: 'sdk',
    shortDescription: 'Request enrichment / response filtering pattern for custom data services.',
    docsUrl: 'https://docs.plainid.io/docs/data-authorizers',
  },

  // ===== API Gateway =====
  {
    id: 'apigee-authorizer',
    name: 'Apigee Authorizer',
    category: 'API Gateway',
    enforcementMode: 'plugin',
    shortDescription: 'Apigee proxy plugin enforcing PBAC at the gateway.',
    docsUrl: 'https://docs.plainid.io/docs/apigee',
  },
  {
    id: 'aws-apigateway-authorizer',
    name: 'AWS API Gateway Authorizer',
    category: 'API Gateway',
    enforcementMode: 'lambda',
    shortDescription: 'Lambda authorizer in front of AWS API Gateway.',
    docsUrl: 'https://docs.plainid.io/docs/amazon-api-gateway',
  },
  {
    id: 'azure-apim-authorizer',
    name: 'Azure API Management Authorizer',
    category: 'API Gateway',
    enforcementMode: 'plugin',
    shortDescription: 'APIM policy that calls PlainID PDP for fine-grained decisions.',
    docsUrl: 'https://docs.plainid.io/docs/azure-api-management-authorizer-configuration',
  },
  {
    id: 'kong-authorizer',
    name: 'Kong Authorizer',
    category: 'API Gateway',
    enforcementMode: 'plugin',
    shortDescription: 'Kong plugin for PBAC enforcement at the gateway.',
    docsUrl: 'https://docs.plainid.io/docs/authorizers',
  },
  {
    id: 'istio-authorizer',
    name: 'Istio Authorizer',
    category: 'API Gateway',
    enforcementMode: 'plugin',
    shortDescription: 'Service mesh enforcement via Envoy/Istio integration.',
    docsUrl: 'https://docs.plainid.io/docs/authorizers',
  },
  {
    id: 'apigw-rest-permit-deny',
    name: 'Permit/Deny REST API (custom gateway)',
    category: 'API Gateway',
    enforcementMode: 'sdk',
    shortDescription: 'Yes/no authorization endpoint for custom or unsupported gateways.',
    docsUrl: 'https://docs.plainid.io/apidocs/authorization-apis',
  },

  // ===== AI Authorization =====
  {
    id: 'langchain-authorizer',
    name: 'LangChain Authorizer',
    category: 'AI Authorization',
    enforcementMode: 'sdk',
    shortDescription: 'Authorization gates inside LangChain agent workflows.',
    docsUrl: 'https://docs.plainid.io/docs/authorizers',
  },
  {
    id: 'langgraph-authorizer',
    name: 'LangGraph Authorizer',
    category: 'AI Authorization',
    enforcementMode: 'sdk',
    shortDescription: 'Authorization at LangGraph state-machine transitions.',
    docsUrl: 'https://docs.plainid.io/docs/authorizers',
  },
  {
    id: 'mcp-authorizer',
    name: 'MCP Authorizer',
    category: 'AI Authorization',
    enforcementMode: 'sdk',
    shortDescription: 'Tool-list filter, tool-invocation auth, and downstream resource auth at the MCP layer.',
    docsUrl: 'https://docs.plainid.io/docs/authorizers',
  },
  {
    id: 'ai-rest-permit-deny',
    name: 'Permit/Deny REST API (custom agent)',
    category: 'AI Authorization',
    enforcementMode: 'sdk',
    shortDescription: 'Yes/no authorization endpoint for custom agent runtimes.',
    docsUrl: 'https://docs.plainid.io/apidocs/authorization-apis',
  },

  // ===== Application =====
  {
    id: 'app-spring-boot-sdk',
    name: 'Java Spring Boot SDK',
    category: 'Application',
    enforcementMode: 'sdk',
    shortDescription: 'Spring Boot library for in-app fine-grained authorization.',
    docsUrl: 'https://docs.plainid.io/docs/authorizers',
  },
  {
    id: 'app-dotnet-sdk',
    name: '.NET SDK',
    category: 'Application',
    enforcementMode: 'sdk',
    shortDescription: '.NET library for in-app fine-grained authorization.',
    docsUrl: 'https://docs.plainid.io/docs/authorizers',
  },
  {
    id: 'app-rest-permit-deny',
    name: 'REST API — Permit/Deny',
    category: 'Application',
    enforcementMode: 'sdk',
    shortDescription: 'Yes/no authorization endpoint for any application.',
    docsUrl: 'https://docs.plainid.io/apidocs/authorization-apis',
  },
  {
    id: 'app-rest-policy-resolution',
    name: 'REST API — Policy Resolution',
    category: 'Application',
    enforcementMode: 'sdk',
    shortDescription: 'Returns the asset list a user can access. Best for large-scale data scenarios.',
    docsUrl: 'https://docs.plainid.io/apidocs/authorization-apis',
  },

  // ===== Other / Custom (always last per category) =====
  // Note: a single id 'custom' is used; the consumer reads custom
  // authorizer name from AuthorizerSpec.customAuthorizerName when
  // the selected id is 'custom'.
];

// Categories that do NOT pick an authorizer themselves — instead they
// reference downstream authorizers from other use cases in the POC.
export const DOWNSTREAM_AUTHORIZER_CATEGORIES: UseCaseCategory[] = ['Identity', 'Compliance'];

export const CATEGORY_HAS_TECH_BLOCK: Record<UseCaseCategory, boolean> = {
  Data: true,
  'API Gateway': true,
  'AI Authorization': true,
  Identity: true,
  Compliance: true,
  Application: true,
  Other: false,
};

export function authorizersForCategory(c: UseCaseCategory): AuthorizerCatalogEntry[] {
  return AUTHORIZER_CATALOG.filter((a) => a.category === c);
}

export function findAuthorizer(id: string): AuthorizerCatalogEntry | undefined {
  return AUTHORIZER_CATALOG.find((a) => a.id === id);
}
