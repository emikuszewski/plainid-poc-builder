import type {
  AiAuthSpec,
  ApiGatewaySpec,
  ApplicationSpec,
  AuthorizerSpec,
  ComplianceSpec,
  DataSpec,
  IdentitySpec,
  TechnicalFoundation,
  TechnicalSpec,
  UseCaseCategory,
  UrlEntry,
} from '../types';
import { authorizersForCategory, emptyUF, findAuthorizer } from '../types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

function emptyAuthorizer(category: UseCaseCategory): AuthorizerSpec {
  // Default to the first catalog entry for the category, if one exists.
  // Identity & Compliance reference downstream authorizers — they still get
  // an AuthorizerSpec but with no selected entry; the per-category block
  // (IdentitySpec/ComplianceSpec) holds the downstream references.
  const catalog = authorizersForCategory(category);
  const defaultId = catalog[0]?.id ?? 'custom';
  const defaultEntry = findAuthorizer(defaultId);
  const defaultDocsUrl = defaultEntry?.docsUrl;
  const presets = defaultEntry?.defaults;

  const docs: UrlEntry[] = defaultDocsUrl
    ? [{ id: uid(), label: 'PlainID Authorizer Documentation', url: defaultDocsUrl, notes: '' }]
    : [];

  // Apply catalog presets to relevant fields when present
  const presetUF = (v?: string) => (v ? { value: v, unknown: false } : emptyUF());

  return {
    selectedAuthorizerId: defaultId,
    customAuthorizerName: emptyUF(),
    version: emptyUF(),
    deploymentTopology: presetUF(presets?.deploymentTopology),
    deploymentTarget: emptyUF(),
    pdpEndpoint: emptyUF(),
    identitySourcePaths: emptyUF(),
    networkPath: emptyUF(),
    credentialsLocation: emptyUF(),
    credentialsProvisioner: emptyUF(),
    enforcementMode: presetUF(presets?.enforcementMode),
    sampleRequestResponse: emptyUF(),
    failureMode: presetUF(presets?.failureMode),
    performanceBudget: emptyUF(),
    requiredPipIntegrations: emptyUF(),
    authorizerDocs: docs,
    openItems: emptyUF(),
  };
}

const emptyData = (): DataSpec => ({
  catalogScope: emptyUF(),
  classificationTaxonomy: emptyUF(),
  classificationDocsUrls: [],
  sampleQueries: emptyUF(),
  connectionMethod: emptyUF(),
  existingAccessControl: emptyUF(),
  performanceBaseline: emptyUF(),
  dataResidencyConstraints: emptyUF(),
});

const emptyApiGateway = (): ApiGatewaySpec => ({
  apiCatalogUrls: [],
  endpointResourceModel: emptyUF(),
  authPatternToday: emptyUF(),
  tokenFlow: emptyUF(),
  gatewayVersion: emptyUF(),
  existingPolicies: emptyUF(),
  backendTrustModel: emptyUF(),
  latencySla: emptyUF(),
});

const emptyAiAuth = (): AiAuthSpec => ({
  agentTopology: emptyUF(),
  toolInventoryUrls: [],
  toolInventoryNotes: emptyUF(),
  callingIdentityPropagation: emptyUF(),
  ragSourcesInScope: emptyUF(),
  agentRuntime: emptyUF(),
  mcpTransport: emptyUF(),
  llmProvider: emptyUF(),
  failureModePolicy: emptyUF(),
});

const emptyApplication = (): ApplicationSpec => ({
  appArchitecture: emptyUF(),
  resourceModel: emptyUF(),
  existingAuthorization: emptyUF(),
  sessionModel: emptyUF(),
  buildDeploy: emptyUF(),
  domainSpecificRules: emptyUF(),
});

const emptyIdentity = (): IdentitySpec => ({
  downstreamAuthorizerUseCaseIds: [],
  roleInventory: emptyUF(),
  groupMembershipVolume: emptyUF(),
  lifecycleIntegration: emptyUF(),
  sourceOfTruthMapping: emptyUF(),
  federationBoundaries: emptyUF(),
});

const emptyCompliance = (): ComplianceSpec => ({
  downstreamAuthorizerUseCaseIds: [],
  regulationSet: emptyUF(),
  existingAuditPipeline: emptyUF(),
  retentionRequirements: emptyUF(),
  sampleAuditQuestions: emptyUF(),
  reviewerPersonas: emptyUF(),
});

export function emptyTechnicalSpec(category: UseCaseCategory): TechnicalSpec {
  const spec: TechnicalSpec = {
    authorizer: emptyAuthorizer(category),
  };

  switch (category) {
    case 'Data':
      spec.data = emptyData();
      break;
    case 'API Gateway':
      spec.apiGateway = emptyApiGateway();
      break;
    case 'AI Authorization':
      spec.aiAuth = emptyAiAuth();
      break;
    case 'Application':
      spec.application = emptyApplication();
      break;
    case 'Identity':
      spec.identity = emptyIdentity();
      break;
    case 'Compliance':
      spec.compliance = emptyCompliance();
      break;
    case 'Other':
      // No category block
      break;
  }

  return spec;
}

export function emptyTechnicalFoundation(): TechnicalFoundation {
  return {
    jwtSampleUrls: [],
    identityAttributeCatalog: emptyUF(),
    testUserAccounts: emptyUF(),
  };
}

// When a use case's category changes mid-edit, we need to reshape its
// technical spec. Keep authorizer, swap the per-category block, and reset
// authorizer if it doesn't belong to the new category.
export function reshapeTechnicalSpec(
  current: TechnicalSpec | undefined,
  newCategory: UseCaseCategory,
): TechnicalSpec {
  if (!current) return emptyTechnicalSpec(newCategory);

  const reshape: TechnicalSpec = {
    authorizer: current.authorizer,
  };

  // If the current authorizer doesn't belong to the new category, reset it
  const validAuthorizers = authorizersForCategory(newCategory).map((a) => a.id);
  if (
    current.authorizer.selectedAuthorizerId !== 'custom' &&
    !validAuthorizers.includes(current.authorizer.selectedAuthorizerId)
  ) {
    reshape.authorizer = emptyAuthorizer(newCategory);
  }

  // Add the new category's block
  switch (newCategory) {
    case 'Data':
      reshape.data = current.data ?? emptyData();
      break;
    case 'API Gateway':
      reshape.apiGateway = current.apiGateway ?? emptyApiGateway();
      break;
    case 'AI Authorization':
      reshape.aiAuth = current.aiAuth ?? emptyAiAuth();
      break;
    case 'Application':
      reshape.application = current.application ?? emptyApplication();
      break;
    case 'Identity':
      reshape.identity = current.identity ?? emptyIdentity();
      break;
    case 'Compliance':
      reshape.compliance = current.compliance ?? emptyCompliance();
      break;
  }

  return reshape;
}
