import type { PocDocument, UnknownableField, UseCase } from '../types';
import { CATEGORY_HAS_TECH_BLOCK, DOWNSTREAM_AUTHORIZER_CATEGORIES, SECTIONS } from '../types';

export interface SectionStatus {
  id: string;
  required: number;
  satisfied: number;
  issues: string[];
}

const has = (s: string | undefined | null) => !!(s && s.trim().length > 0);
const hasN = (s: string | undefined | null, n: number) => !!(s && s.trim().length >= n);

// An UnknownableField counts as satisfied if it has a value OR is explicitly
// marked unknown (TBD). This is the "required, and if unknown we can note that"
// behavior we agreed on.
const ufSatisfied = (f: UnknownableField | undefined): boolean =>
  !!f && (f.unknown || has(f.value));

export function evaluateSection(poc: PocDocument, sectionId: string): SectionStatus {
  const issues: string[] = [];
  let required = 0;
  let satisfied = 0;

  const check = (cond: boolean, label: string) => {
    required++;
    if (cond) satisfied++;
    else issues.push(label);
  };

  switch (sectionId) {
    case 'customer':
      check(has(poc.customerName), 'Customer name missing');
      check(has(poc.customerIndustry), 'Industry missing');
      check(hasN(poc.customerOverview, 80), 'Customer overview is thin or missing');
      break;
    case 'context':
      check(hasN(poc.compellingEvent, 40), 'Compelling event missing or hand-wavy');
      check(hasN(poc.authorizationContext, 40), 'Authorization context missing');
      break;
    case 'objectives':
      check(hasN(poc.objectives, 40), 'Objectives statement missing');
      check(hasN(poc.whatToValidate, 40), 'What customer will validate is missing');
      check(hasN(poc.postPocDeliverables, 40), 'Post-POC deliverables missing');
      break;
    case 'discovery':
      check(poc.inScopeSystems.length > 0, 'No in-scope systems defined');
      check(
        poc.inScopeSystems.every((s) => has(s.name) && has(s.focus)),
        'Some in-scope systems are missing name/focus',
      );
      check(poc.identitySources.length > 0, 'No identity sources defined');
      break;
    case 'timeline':
      check(has(poc.timelineSummary), 'Timeline summary missing');
      check(poc.sprints.length > 0, 'No sprints defined');
      break;
    case 'framework':
      check(has(poc.cadence), 'Cadence not described');
      check(poc.personas.length > 0, 'No personas defined');
      break;
    case 'team':
      check(poc.teamMembers.length > 1, 'Team members not populated');
      check(
        poc.teamMembers.some((m) => /customer|client|prospect/i.test(m.org) || (!/plainid/i.test(m.org) && has(m.org))),
        'No customer-side team member identified',
      );
      check(
        poc.teamMembers.some((m) => /plainid/i.test(m.org)),
        'No PlainID team member identified',
      );
      break;
    case 'usecases':
      check(poc.useCases.length > 0, 'At least one use case is required');
      check(
        poc.useCases.every((u) => hasN(u.successCriteria, 40)),
        'Some use cases have thin or missing success criteria',
      );
      check(
        poc.useCases.every((u) => hasN(u.objectives, 40)),
        'Some use cases have thin or missing objectives',
      );
      break;
    case 'technical':
      // POC-level universal foundation — required regardless of use case count
      check(
        (poc.technicalFoundation?.jwtSampleUrls.length ?? 0) > 0,
        'JWT samples missing (Universal)',
      );
      check(
        ufSatisfied(poc.technicalFoundation?.identityAttributeCatalog),
        'Identity attribute catalog missing (Universal)',
      );
      check(
        ufSatisfied(poc.technicalFoundation?.testUserAccounts),
        'Test user accounts not defined (Universal)',
      );
      // Each use case with a tech block contributes its own checks.
      // Identity & Compliance are downstream — they don't get an authorizer
      // block but do need a downstream-authorizer selection.
      poc.useCases
        .filter((u) => CATEGORY_HAS_TECH_BLOCK[u.category])
        .forEach((u) => evaluateTechnicalForUseCase(u, check));
      // Edge case: no qualifying use cases → require at least one
      if (!poc.useCases.some((u) => CATEGORY_HAS_TECH_BLOCK[u.category])) {
        check(false, 'No use cases require a technical foundation block (all are "Other")');
      }
      break;
    case 'dependencies':
      check(hasN(poc.customerResponsibilities, 40), 'Customer responsibilities not populated');
      check(hasN(poc.plainidResponsibilities, 40), 'PlainID responsibilities not populated');
      break;
    case 'tracker':
      check(poc.tracker.length > 0, 'Tracker is empty');
      break;
    case 'docs':
      check(poc.referenceDocs.length > 0, 'No reference docs');
      break;
  }

  return { id: sectionId, required, satisfied, issues };
}

function evaluateTechnicalForUseCase(
  u: UseCase,
  check: (cond: boolean, label: string) => void,
) {
  const spec = u.technicalSpec;
  const label = u.title || `Use Case "${u.category}"`;
  if (!spec) {
    check(false, `${label}: technical spec missing`);
    return;
  }

  // Authorizer block — only for non-downstream categories
  if (!DOWNSTREAM_AUTHORIZER_CATEGORIES.includes(u.category)) {
    const a = spec.authorizer;
    check(!!a.selectedAuthorizerId, `${label}: no authorizer selected`);
    if (a.selectedAuthorizerId === 'custom') {
      check(ufSatisfied(a.customAuthorizerName), `${label}: custom authorizer name missing`);
    }
    check(ufSatisfied(a.version), `${label}: authorizer version not specified`);
    check(ufSatisfied(a.deploymentTopology), `${label}: deployment topology missing`);
    check(ufSatisfied(a.deploymentTarget), `${label}: deployment target missing`);
    check(ufSatisfied(a.pdpEndpoint), `${label}: PDP endpoint missing`);
    check(ufSatisfied(a.networkPath), `${label}: network path missing`);
    check(ufSatisfied(a.identitySourcePaths), `${label}: identity source paths missing`);
    check(ufSatisfied(a.requiredPipIntegrations), `${label}: required PIP integrations missing`);
    check(ufSatisfied(a.credentialsLocation), `${label}: credentials location missing`);
    check(ufSatisfied(a.credentialsProvisioner), `${label}: credentials provisioner missing`);
    check(ufSatisfied(a.enforcementMode), `${label}: enforcement mode missing`);
    check(ufSatisfied(a.failureMode), `${label}: failure mode not described`);
    check(ufSatisfied(a.performanceBudget), `${label}: performance budget missing`);
  }

  // Per-category required fields
  if (u.category === 'Data' && spec.data) {
    check(ufSatisfied(spec.data.catalogScope), `${label}: data catalog scope missing`);
    check(ufSatisfied(spec.data.classificationTaxonomy), `${label}: classification taxonomy missing`);
    check(ufSatisfied(spec.data.sampleQueries), `${label}: sample queries missing`);
    check(ufSatisfied(spec.data.connectionMethod), `${label}: connection method missing`);
    check(ufSatisfied(spec.data.existingAccessControl), `${label}: existing access control missing`);
    check(ufSatisfied(spec.data.performanceBaseline), `${label}: performance baseline missing`);
    check(ufSatisfied(spec.data.dataResidencyConstraints), `${label}: data residency constraints missing`);
  } else if (u.category === 'API Gateway' && spec.apiGateway) {
    const g = spec.apiGateway;
    check(g.apiCatalogUrls.length > 0, `${label}: API specifications (Swagger) missing`);
    check(ufSatisfied(g.endpointResourceModel), `${label}: endpoint resource model missing`);
    check(ufSatisfied(g.authPatternToday), `${label}: auth pattern today missing`);
    check(ufSatisfied(g.tokenFlow), `${label}: token flow missing`);
    check(ufSatisfied(g.gatewayVersion), `${label}: gateway version missing`);
    check(ufSatisfied(g.existingPolicies), `${label}: existing gateway policies missing`);
    check(ufSatisfied(g.backendTrustModel), `${label}: backend trust model missing`);
    check(ufSatisfied(g.latencySla), `${label}: latency SLA missing`);
  } else if (u.category === 'AI Authorization' && spec.aiAuth) {
    const a = spec.aiAuth;
    check(ufSatisfied(a.agentTopology), `${label}: agent topology missing`);
    check(a.toolInventoryUrls.length > 0, `${label}: tool inventory specs missing`);
    check(ufSatisfied(a.toolInventoryNotes), `${label}: tool inventory notes missing`);
    check(ufSatisfied(a.callingIdentityPropagation), `${label}: identity propagation missing`);
    check(ufSatisfied(a.ragSourcesInScope), `${label}: RAG sources missing`);
    check(ufSatisfied(a.agentRuntime), `${label}: agent runtime missing`);
    check(ufSatisfied(a.mcpTransport), `${label}: MCP transport missing`);
    check(ufSatisfied(a.llmProvider), `${label}: LLM provider missing`);
    check(ufSatisfied(a.failureModePolicy), `${label}: failure mode policy missing`);
  } else if (u.category === 'Application' && spec.application) {
    const a = spec.application;
    check(ufSatisfied(a.appArchitecture), `${label}: app architecture missing`);
    check(ufSatisfied(a.resourceModel), `${label}: resource model missing`);
    check(ufSatisfied(a.existingAuthorization), `${label}: existing authorization missing`);
    check(ufSatisfied(a.sessionModel), `${label}: session model missing`);
    check(ufSatisfied(a.buildDeploy), `${label}: build/deploy missing`);
    // domainSpecificRules is optional — not all apps have a complex domain
  } else if (u.category === 'Identity' && spec.identity) {
    const i = spec.identity;
    check(i.downstreamAuthorizerUseCaseIds.length > 0, `${label}: no downstream authorizers selected`);
    check(ufSatisfied(i.roleInventory), `${label}: role inventory missing`);
    check(ufSatisfied(i.groupMembershipVolume), `${label}: group membership volume missing`);
    check(ufSatisfied(i.lifecycleIntegration), `${label}: lifecycle integration missing`);
    check(ufSatisfied(i.sourceOfTruthMapping), `${label}: source-of-truth mapping missing`);
    check(ufSatisfied(i.federationBoundaries), `${label}: federation boundaries missing`);
  } else if (u.category === 'Compliance' && spec.compliance) {
    const c = spec.compliance;
    check(c.downstreamAuthorizerUseCaseIds.length > 0, `${label}: no authorizers under audit`);
    check(ufSatisfied(c.regulationSet), `${label}: regulation set missing`);
    check(ufSatisfied(c.existingAuditPipeline), `${label}: existing audit pipeline missing`);
    check(ufSatisfied(c.retentionRequirements), `${label}: retention requirements missing`);
    check(ufSatisfied(c.sampleAuditQuestions), `${label}: sample audit questions missing`);
    check(ufSatisfied(c.reviewerPersonas), `${label}: reviewer personas missing`);
  }
}

export function evaluateAll(poc: PocDocument): SectionStatus[] {
  // Iterate the SECTIONS array directly so this function stays in sync
  // whenever sections are added or reordered. Previously this used a
  // hardcoded list that drifted out of step when Team was introduced.
  return SECTIONS.map((s) => evaluateSection(poc, s.id));
}

export function overallCompleteness(poc: PocDocument): {
  satisfied: number;
  required: number;
  pct: number;
  blockers: string[];
} {
  const all = evaluateAll(poc);
  const satisfied = all.reduce((a, b) => a + b.satisfied, 0);
  const required = all.reduce((a, b) => a + b.required, 0);
  const pct = required === 0 ? 0 : Math.round((satisfied / required) * 100);
  const blockers = all.flatMap((s) => s.issues);
  return { satisfied, required, pct, blockers };
}
