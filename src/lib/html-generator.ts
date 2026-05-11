import type { PocDocument, UnknownableField, UrlEntry, UseCase } from '../types';
import {
  CATEGORY_HAS_TECH_BLOCK,
  DOWNSTREAM_AUTHORIZER_CATEGORIES,
  findAuthorizer,
} from '../types';

const escape = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const lines = (s: string) =>
  String(s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const ul = (s: string) => {
  const items = lines(s);
  if (!items.length) return '';
  return `<ul>${items.map((l) => `<li>${escape(l)}</li>`).join('')}</ul>`;
};

const p = (s: string) => {
  const paras = String(s ?? '')
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean);
  return paras.map((para) => `<p>${escape(para).replace(/\n/g, '<br/>')}</p>`).join('');
};

// Render an UnknownableField — show value, or "TBD" pill if marked unknown
const uf = (f: UnknownableField | undefined): string => {
  if (!f) return '<em>—</em>';
  if (f.unknown) return '<span class="tbd">TBD — to be resolved during POC</span>';
  return f.value ? escape(f.value).replace(/\n/g, '<br/>') : '<em>—</em>';
};

const ufList = (f: UnknownableField | undefined): string => {
  if (!f) return '';
  if (f.unknown) return '<p><span class="tbd">TBD — to be resolved during POC</span></p>';
  const items = lines(f.value);
  if (items.length > 1) {
    return `<ul>${items.map((l) => `<li>${escape(l)}</li>`).join('')}</ul>`;
  }
  return f.value ? `<p>${escape(f.value).replace(/\n/g, '<br/>')}</p>` : '';
};

const urlEntries = (entries: UrlEntry[] | undefined): string => {
  if (!entries || entries.length === 0) return '<em>—</em>';
  return `<ul>${entries
    .map(
      (e) =>
        `<li><strong>${escape(e.label || 'URL')}</strong> — <a href="${escape(e.url)}">${escape(e.url)}</a>${
          e.notes ? ` — <em>${escape(e.notes)}</em>` : ''
        }</li>`,
    )
    .join('')}</ul>`;
};

export function renderHtml(poc: PocDocument, opts: { standalone?: boolean } = {}): string {
  const customer = poc.customerName || 'Customer';

  const inScopeRows = poc.inScopeSystems
    .map(
      (s) =>
        `<tr><td><strong>${escape(s.name)}</strong></td><td>${escape(s.focus)}</td><td>${escape(s.priority)}</td></tr>`,
    )
    .join('');

  const idRows = poc.identitySources
    .map(
      (s) =>
        `<li><strong>${escape(s.name)}</strong> — <em>${escape(s.type)}</em>${
          s.notes ? ` — ${escape(s.notes)}` : ''
        }</li>`,
    )
    .join('');

  const sprintRows = poc.sprints
    .map(
      (s) =>
        `<tr><td>${escape(s.phase)}</td><td>${escape(s.weeks)}</td><td>${escape(s.focus)}</td></tr>`,
    )
    .join('');

  const personaItems = poc.personas
    .map((p) => `<li><strong>${escape(p.name)}</strong> — ${escape(p.description)}</li>`)
    .join('');

  const teamRows = poc.teamMembers
    .map(
      (m) =>
        `<tr><td>${escape(m.org)}</td><td>${escape(m.name)}</td><td>${escape(
          m.role,
        )}</td><td>${escape(m.email)}</td></tr>`,
    )
    .join('');

  const useCaseBlocks = poc.useCases
    .map(
      (u, i) => `
      <table class="usecase">
        <thead>
          <tr><th colspan="2">Use Case ${i + 1}: ${escape(u.title)}</th></tr>
        </thead>
        <tbody>
          <tr><td class="lbl">Persona</td><td>${escape(u.persona)}</td></tr>
          <tr><td class="lbl">Objectives</td><td>${ul(u.objectives) || '<em>—</em>'}</td></tr>
          <tr><td class="lbl">Success Criteria</td><td>${ul(u.successCriteria) || '<em>—</em>'}</td></tr>
        </tbody>
      </table>
    `,
    )
    .join('');

  const trackerRows = poc.tracker
    .map(
      (t) =>
        `<tr><td>${escape(t.phase)}</td><td>${escape(t.task)}</td><td>${escape(
          t.responsible,
        )}</td><td>${escape(t.status)}</td><td>${escape(t.dueDate || '—')}</td></tr>`,
    )
    .join('');

  const docItems = poc.referenceDocs
    .map(
      (d) =>
        `<li><a href="${escape(d.url)}"><strong>${escape(d.title)}</strong></a>${
          d.description ? ` — ${escape(d.description)}` : ''
        }</li>`,
    )
    .join('');

  // Technical Foundation — one block per use case that has a tech category
  const techUseCases = poc.useCases.filter((u) => CATEGORY_HAS_TECH_BLOCK[u.category]);
  const technicalBlocks = techUseCases.map((u, i) => renderTechBlockForUseCase(u, i, poc.useCases)).join('');

  // POC-level universal foundation rendered once at the top of Technical Foundation
  const tf = poc.technicalFoundation;
  const universalFoundationHtml = `
    <table class="techspec">
      <thead><tr><th colspan="2">Universal — Identity &amp; Test Users</th></tr></thead>
      <tbody>
        <tr><td class="lbl">JWT / OIDC Samples</td><td>${urlEntries(tf?.jwtSampleUrls)}</td></tr>
        <tr><td class="lbl">Identity Attributes</td><td>${ufList(tf?.identityAttributeCatalog)}</td></tr>
        <tr><td class="lbl">Test Users</td><td>${ufList(tf?.testUserAccounts)}</td></tr>
      </tbody>
    </table>`;

  const body = `
    <header class="cover">
      <div class="brand">PLAINID · THE AUTHORIZATION COMPANY</div>
      <h1>Proof of Concept</h1>
      <h2>${escape(customer)}</h2>
      <div class="meta">CONFIDENTIAL</div>
    </header>

    <section>
      <h2>PlainID Overview</h2>
      <p>PlainID enables enterprises to modernize their access control strategy with centralized, dynamic, and scalable authorization — delivering security, operational efficiency, and regulatory compliance. We sit at the intersection of IAM, Zero Trust, and Data Security, helping organizations translate complex access requirements into business-enabling policies.</p>
      <p>As a leader in Authorization-as-a-Service, PlainID provides a comprehensive Policy-Based Access Control (PBAC) platform to centrally manage, enforce, and audit fine-grained, dynamic access policies across Applications, APIs, Data Platforms, and Digital Services.</p>
      <p>At our core, PlainID decouples authorization logic from applications and centralizes it into a flexible, scalable policy engine — empowering organizations like ${escape(customer)} to dynamically govern who can access what, under which conditions, based on identity, context, and risk.</p>
      <h3>Common Business Drivers</h3>
      <ul>
        <li><strong>Dynamic, Fine-Grained Access Control</strong> — Enforce real-time decisions based on user identity, attributes (department, role, clearance), environment, and risk signals.</li>
        <li><strong>Zero Trust Architecture (ZTA) Enablement</strong> — Centralize authorization to support least-privilege access and continuous validation.</li>
        <li><strong>Data Security &amp; Governance Compliance</strong> — Provide transparent, explainable policies for audit and regulatory review (SOX, GDPR, CCPA, etc.).</li>
        <li><strong>Role Consolidation &amp; Policy Migration</strong> — Convert legacy role-based access models into dynamic, attribute-driven PBAC policies at scale.</li>
        <li><strong>Data Platform Authorization</strong> — Govern access to Databricks, Snowflake, and other data platforms through unified policy enforcement.</li>
        <li><strong>API Gateway Integration</strong> — Manage authorization uniformly behind API gateways without embedding logic in backend services.</li>
        <li><strong>Accelerating Data &amp; AI Initiatives</strong> — Secure data access for analytics, AI systems, and APIs while supporting dynamic, attribute-based controls on sensitive datasets.</li>
        <li><strong>Faster Cloud &amp; SaaS Adoption</strong> — Provide consistent authorization across hybrid and multi-cloud environments.</li>
      </ul>
    </section>

    <section>
      <h2>${escape(customer)} Overview</h2>
      ${p(poc.customerOverview) || '<p><em>—</em></p>'}
    </section>

    <section>
      <h3>Authorization Context &amp; Compelling Event</h3>
      ${p(poc.compellingEvent) || '<p><em>—</em></p>'}
      ${poc.authorizationContext ? p(poc.authorizationContext) : ''}
    </section>

    <section>
      <h2>POC Objectives &amp; Outcomes</h2>
      ${p(poc.objectives)}
      <h3>What ${escape(customer)} Will Validate</h3>
      ${ul(poc.whatToValidate) || '<p><em>—</em></p>'}
      <h3>Post-POC Deliverables from PlainID</h3>
      ${ul(poc.postPocDeliverables) || '<p><em>—</em></p>'}
    </section>

    <section>
      <h2>Discovery Summary</h2>
      ${
        poc.tenantStrategy && poc.tenantStrategy.trim()
          ? `<h3>Tenant Strategy</h3>${p(poc.tenantStrategy)}`
          : ''
      }
      <h3>In-Scope Systems &amp; Platforms</h3>
      ${
        inScopeRows
          ? `<table><thead><tr><th>System / Platform</th><th>POC Focus</th><th>Priority</th></tr></thead><tbody>${inScopeRows}</tbody></table>`
          : '<p><em>None defined.</em></p>'
      }
      <h3>Identity Providers</h3>
      ${idRows ? `<ul>${idRows}</ul>` : '<p><em>None defined.</em></p>'}
      ${
        poc.architectureConstraints
          ? `<h3>Architecture Constraints &amp; Design Decisions</h3>${ul(poc.architectureConstraints) || p(poc.architectureConstraints)}`
          : ''
      }
      ${
        poc.outOfScope && poc.outOfScope.trim()
          ? `<h3>Out of Scope</h3><p style="color:#525252">The following items have been discussed and are explicitly out of scope for this POC.</p>${ul(poc.outOfScope) || p(poc.outOfScope)}`
          : ''
      }
    </section>

    <section>
      <h2>Use Cases &amp; Success Criteria</h2>
      <p><strong>PlainID Platform Components Referenced:</strong> PAP (Policy Administration Point), PDP (Policy Decision Point), PIP (Policy Information Point), PEP (Policy Enforcement Point), PAA (PlainID Authorization Agent).</p>
      ${useCaseBlocks || '<p><em>No use cases defined.</em></p>'}
    </section>

    <section>
      <h2>Technical Foundation</h2>
      <p>Authorizer config and the specs PlainID needs to integrate. Identity context applies to every use case; per-use-case blocks cover authorizer-specific and category-specific details.</p>
      ${universalFoundationHtml}
      ${technicalBlocks || '<p><em>No technical-spec use cases defined.</em></p>'}
    </section>

    <section>
      <h2>POC Timeline</h2>
      ${p(poc.timelineSummary)}
      ${
        sprintRows
          ? `<table><thead><tr><th>Phase</th><th>Weeks</th><th>Focus</th></tr></thead><tbody>${sprintRows}</tbody></table>`
          : ''
      }
    </section>

    <section>
      <h2>POC Framework</h2>
      <h3>Collaboration Model</h3>
      ${p(poc.cadence)}
      <h3>Test Personas</h3>
      ${personaItems ? `<ul>${personaItems}</ul>` : '<p><em>—</em></p>'}
      <h3>POC Team Members &amp; Responsibilities</h3>
      ${
        teamRows
          ? `<table><thead><tr><th>Org</th><th>Name</th><th>Title / Role</th><th>Contact</th></tr></thead><tbody>${teamRows}</tbody></table>`
          : '<p><em>—</em></p>'
      }
    </section>

    <section>
      <h2>POC Dependencies &amp; Pre-Requisites</h2>
      <h3>${escape(customer)} Responsibilities</h3>
      ${ul(poc.customerResponsibilities) || '<p><em>—</em></p>'}
      <h3>PlainID Responsibilities</h3>
      ${ul(poc.plainidResponsibilities) || '<p><em>—</em></p>'}
      ${
        poc.openItems
          ? `<h3>Open Items to Resolve</h3>${ul(poc.openItems) || p(poc.openItems)}`
          : ''
      }
    </section>

    <section>
      <h2>POC Tracker</h2>
      ${
        trackerRows
          ? `<table class="tracker"><thead><tr><th>Phase</th><th>Task</th><th>Responsible</th><th>Status</th><th>Due</th></tr></thead><tbody>${trackerRows}</tbody></table>`
          : '<p><em>—</em></p>'
      }
    </section>

    <section>
      <h2>Reference Documentation</h2>
      ${docItems ? `<ul>${docItems}</ul>` : '<p><em>—</em></p>'}
    </section>

    <footer>© ${new Date().getFullYear()} PlainID Ltd. All rights reserved · Confidential</footer>
  `;

  if (!opts.standalone) return body;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>PlainID POC — ${escape(customer)}</title>
<style>${printStyles()}</style>
</head>
<body class="poc-doc">${body}</body>
</html>`;
}

function renderTechBlockForUseCase(u: UseCase, idx: number, allUseCases: UseCase[]): string {
  const spec = u.technicalSpec;
  if (!spec) return '';

  const isDownstream = DOWNSTREAM_AUTHORIZER_CATEGORIES.includes(u.category);

  // Authorizer block — skip for Identity / Compliance
  let authorizerHtml = '';
  if (!isDownstream) {
    const a = spec.authorizer;
    const catalogEntry = findAuthorizer(a.selectedAuthorizerId);
    const authorizerName =
      a.selectedAuthorizerId === 'custom'
        ? a.customAuthorizerName.unknown
          ? 'TBD'
          : a.customAuthorizerName.value || 'Custom (unnamed)'
        : catalogEntry?.name ?? a.selectedAuthorizerId;
    authorizerHtml = `
      <table class="techspec">
        <thead><tr><th colspan="2">Authorizer · ${escape(authorizerName)}</th></tr></thead>
        <tbody>
          ${catalogEntry ? `<tr><td class="lbl">Description</td><td><em>${escape(catalogEntry.shortDescription)}</em></td></tr>` : ''}
          <tr><td class="lbl">Version</td><td>${uf(a.version)}</td></tr>
          <tr><td class="lbl">Enforcement Mode</td><td>${uf(a.enforcementMode)}</td></tr>
          <tr><td class="lbl">Deployment Topology</td><td>${uf(a.deploymentTopology)}</td></tr>
          <tr><td class="lbl">Deployment Target</td><td>${uf(a.deploymentTarget)}</td></tr>
          <tr><td class="lbl">PDP Endpoint</td><td>${uf(a.pdpEndpoint)}</td></tr>
          <tr><td class="lbl">Network Path</td><td>${uf(a.networkPath)}</td></tr>
          <tr><td class="lbl">Identity Source Paths</td><td>${ufList(a.identitySourcePaths)}</td></tr>
          <tr><td class="lbl">Required PIP Integrations</td><td>${ufList(a.requiredPipIntegrations)}</td></tr>
          <tr><td class="lbl">Credentials Location</td><td>${uf(a.credentialsLocation)}</td></tr>
          <tr><td class="lbl">Credentials Provisioner</td><td>${uf(a.credentialsProvisioner)}</td></tr>
          <tr><td class="lbl">Failure Mode</td><td>${uf(a.failureMode)}</td></tr>
          <tr><td class="lbl">Performance Budget</td><td>${uf(a.performanceBudget)}</td></tr>
          <tr><td class="lbl">Sample Request / Response</td><td>${ufList(a.sampleRequestResponse)}</td></tr>
          <tr><td class="lbl">Authorizer Documentation</td><td>${urlEntries(a.authorizerDocs)}</td></tr>
          <tr><td class="lbl">Open Items</td><td>${ufList(a.openItems)}</td></tr>
        </tbody>
      </table>`;
  }

  // Per-category block
  let categoryHtml = '';
  if (u.category === 'Data' && spec.data) {
    const d = spec.data;
    categoryHtml = `
      <table class="techspec">
        <thead><tr><th colspan="2">Data Layer Specifics</th></tr></thead>
        <tbody>
          <tr><td class="lbl">Catalog Scope</td><td>${ufList(d.catalogScope)}</td></tr>
          <tr><td class="lbl">Classification Taxonomy</td><td>${ufList(d.classificationTaxonomy)}</td></tr>
          <tr><td class="lbl">Classification Docs</td><td>${urlEntries(d.classificationDocsUrls)}</td></tr>
          <tr><td class="lbl">Sample Queries</td><td>${ufList(d.sampleQueries)}</td></tr>
          <tr><td class="lbl">Connection Method</td><td>${ufList(d.connectionMethod)}</td></tr>
          <tr><td class="lbl">Existing Access Control</td><td>${ufList(d.existingAccessControl)}</td></tr>
          <tr><td class="lbl">Performance Baseline</td><td>${uf(d.performanceBaseline)}</td></tr>
          <tr><td class="lbl">Data Residency Constraints</td><td>${ufList(d.dataResidencyConstraints)}</td></tr>
        </tbody>
      </table>`;
  } else if (u.category === 'API Gateway' && spec.apiGateway) {
    const g = spec.apiGateway;
    categoryHtml = `
      <table class="techspec">
        <thead><tr><th colspan="2">API Gateway Specifics</th></tr></thead>
        <tbody>
          <tr><td class="lbl">API Specifications</td><td>${urlEntries(g.apiCatalogUrls)}</td></tr>
          <tr><td class="lbl">Endpoint Resource Model</td><td>${ufList(g.endpointResourceModel)}</td></tr>
          <tr><td class="lbl">Auth Pattern Today</td><td>${ufList(g.authPatternToday)}</td></tr>
          <tr><td class="lbl">Token Flow</td><td>${ufList(g.tokenFlow)}</td></tr>
          <tr><td class="lbl">Gateway Version</td><td>${uf(g.gatewayVersion)}</td></tr>
          <tr><td class="lbl">Existing Gateway Policies</td><td>${ufList(g.existingPolicies)}</td></tr>
          <tr><td class="lbl">Backend Trust Model</td><td>${uf(g.backendTrustModel)}</td></tr>
          <tr><td class="lbl">Latency SLA</td><td>${uf(g.latencySla)}</td></tr>
        </tbody>
      </table>`;
  } else if (u.category === 'AI Authorization' && spec.aiAuth) {
    const a = spec.aiAuth;
    categoryHtml = `
      <table class="techspec">
        <thead><tr><th colspan="2">AI Authorization Specifics</th></tr></thead>
        <tbody>
          <tr><td class="lbl">Agent Topology</td><td>${ufList(a.agentTopology)}</td></tr>
          <tr><td class="lbl">Tool Inventory Specs</td><td>${urlEntries(a.toolInventoryUrls)}</td></tr>
          <tr><td class="lbl">Tool Inventory Notes</td><td>${ufList(a.toolInventoryNotes)}</td></tr>
          <tr><td class="lbl">Calling Identity Propagation</td><td>${ufList(a.callingIdentityPropagation)}</td></tr>
          <tr><td class="lbl">RAG Sources</td><td>${ufList(a.ragSourcesInScope)}</td></tr>
          <tr><td class="lbl">Agent Runtime</td><td>${ufList(a.agentRuntime)}</td></tr>
          <tr><td class="lbl">MCP Transport</td><td>${uf(a.mcpTransport)}</td></tr>
          <tr><td class="lbl">LLM Provider</td><td>${ufList(a.llmProvider)}</td></tr>
          <tr><td class="lbl">Failure Mode Policy</td><td>${ufList(a.failureModePolicy)}</td></tr>
        </tbody>
      </table>`;
  } else if (u.category === 'Application' && spec.application) {
    const a = spec.application;
    categoryHtml = `
      <table class="techspec">
        <thead><tr><th colspan="2">Application Specifics</th></tr></thead>
        <tbody>
          <tr><td class="lbl">App Architecture</td><td>${ufList(a.appArchitecture)}</td></tr>
          <tr><td class="lbl">Resource Model</td><td>${ufList(a.resourceModel)}</td></tr>
          <tr><td class="lbl">Existing Authorization</td><td>${ufList(a.existingAuthorization)}</td></tr>
          <tr><td class="lbl">Session Model</td><td>${ufList(a.sessionModel)}</td></tr>
          <tr><td class="lbl">Build &amp; Deploy</td><td>${ufList(a.buildDeploy)}</td></tr>
          <tr><td class="lbl">Domain-Specific Rules</td><td>${ufList(a.domainSpecificRules)}</td></tr>
        </tbody>
      </table>`;
  } else if (u.category === 'Identity' && spec.identity) {
    const i = spec.identity;
    const downstream = i.downstreamAuthorizerUseCaseIds
      .map((id) => allUseCases.find((c) => c.id === id))
      .filter(Boolean) as UseCase[];
    const downstreamList = downstream.length
      ? `<ul>${downstream
          .map((d) => {
            const auth = d.technicalSpec
              ? findAuthorizer(d.technicalSpec.authorizer.selectedAuthorizerId)
              : undefined;
            return `<li>${escape(d.title || '(untitled)')} — <em>${escape(d.category)}</em>${
              auth ? ` · ${escape(auth.name)}` : ''
            }</li>`;
          })
          .join('')}</ul>`
      : '<em>—</em>';
    categoryHtml = `
      <table class="techspec">
        <thead><tr><th colspan="2">Identity Specifics</th></tr></thead>
        <tbody>
          <tr><td class="lbl">Downstream Authorizers</td><td>${downstreamList}</td></tr>
          <tr><td class="lbl">Role Inventory</td><td>${ufList(i.roleInventory)}</td></tr>
          <tr><td class="lbl">Group Membership Volume</td><td>${ufList(i.groupMembershipVolume)}</td></tr>
          <tr><td class="lbl">Lifecycle Integration</td><td>${ufList(i.lifecycleIntegration)}</td></tr>
          <tr><td class="lbl">Source-of-Truth Mapping</td><td>${ufList(i.sourceOfTruthMapping)}</td></tr>
          <tr><td class="lbl">Federation Boundaries</td><td>${ufList(i.federationBoundaries)}</td></tr>
        </tbody>
      </table>`;
  } else if (u.category === 'Compliance' && spec.compliance) {
    const c = spec.compliance;
    const downstream = c.downstreamAuthorizerUseCaseIds
      .map((id) => allUseCases.find((c2) => c2.id === id))
      .filter(Boolean) as UseCase[];
    const downstreamList = downstream.length
      ? `<ul>${downstream
          .map((d) => {
            const auth = d.technicalSpec
              ? findAuthorizer(d.technicalSpec.authorizer.selectedAuthorizerId)
              : undefined;
            return `<li>${escape(d.title || '(untitled)')} — <em>${escape(d.category)}</em>${
              auth ? ` · ${escape(auth.name)}` : ''
            }</li>`;
          })
          .join('')}</ul>`
      : '<em>—</em>';
    categoryHtml = `
      <table class="techspec">
        <thead><tr><th colspan="2">Compliance Specifics</th></tr></thead>
        <tbody>
          <tr><td class="lbl">Authorizers Under Audit</td><td>${downstreamList}</td></tr>
          <tr><td class="lbl">Regulation Set</td><td>${ufList(c.regulationSet)}</td></tr>
          <tr><td class="lbl">Existing Audit Pipeline</td><td>${ufList(c.existingAuditPipeline)}</td></tr>
          <tr><td class="lbl">Retention Requirements</td><td>${uf(c.retentionRequirements)}</td></tr>
          <tr><td class="lbl">Sample Audit Questions</td><td>${ufList(c.sampleAuditQuestions)}</td></tr>
          <tr><td class="lbl">Reviewer Personas</td><td>${ufList(c.reviewerPersonas)}</td></tr>
        </tbody>
      </table>`;
  }

  return `
    <div class="techblock">
      <h3>${escape(u.title || '(untitled)')} <span class="cat">${escape(u.category)}</span></h3>
      ${authorizerHtml}
      ${categoryHtml}
    </div>`;
}

export function printStyles(): string {
  return `
    body.poc-doc {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      background: #fff;
      max-width: 920px;
      margin: 40px auto;
      padding: 0 48px 80px;
      line-height: 1.55;
    }
    .poc-doc .cover {
      border-bottom: 4px solid #0a0a0a;
      padding-bottom: 32px;
      margin-bottom: 40px;
    }
    .poc-doc .cover .brand {
      font-size: 11px;
      letter-spacing: 0.18em;
      color: #555;
      font-weight: 600;
    }
    .poc-doc .cover h1 {
      font-size: 36px;
      margin: 24px 0 8px;
      letter-spacing: -0.02em;
    }
    .poc-doc .cover h2 {
      font-size: 28px;
      margin: 0 0 24px;
      color: #0d8a72;
      border: none;
      padding: 0;
    }
    .poc-doc .cover .meta {
      font-size: 11px;
      letter-spacing: 0.18em;
      color: #555;
    }
    .poc-doc h2 {
      font-size: 20px;
      margin-top: 36px;
      padding-bottom: 8px;
      border-bottom: 1px solid #ddd;
      letter-spacing: -0.01em;
    }
    .poc-doc h3 {
      font-size: 15px;
      margin-top: 24px;
      color: #333;
      letter-spacing: -0.005em;
    }
    .poc-doc p { margin: 10px 0; }
    .poc-doc ul { margin: 10px 0 16px; padding-left: 22px; }
    .poc-doc ul li { margin: 5px 0; }
    .poc-doc table {
      border-collapse: collapse;
      width: 100%;
      margin: 14px 0 20px;
      font-size: 13px;
    }
    .poc-doc th, .poc-doc td {
      border: 1px solid #d6d6d6;
      padding: 8px 12px;
      text-align: left;
      vertical-align: top;
    }
    .poc-doc thead th {
      background: #f4f4f4;
      font-weight: 600;
    }
    .poc-doc table.usecase {
      margin-bottom: 24px;
    }
    .poc-doc table.usecase thead th {
      background: #0a0a0a;
      color: #fff;
      text-align: left;
      font-size: 14px;
    }
    .poc-doc table.usecase td.lbl {
      width: 160px;
      font-weight: 600;
      background: #fafafa;
      color: #555;
    }
    .poc-doc table.usecase ul { padding-left: 18px; margin: 4px 0; }
    .poc-doc table.tracker { font-size: 12px; }
    .poc-doc .techblock {
      margin: 18px 0 28px;
      padding: 16px 18px;
      background: #fafafa;
      border: 1px solid #e6e6e6;
      border-radius: 4px;
    }
    .poc-doc .techblock h3 {
      margin-top: 0;
      font-size: 14px;
      color: #1a1a1a;
      letter-spacing: -0.005em;
    }
    .poc-doc .techblock h3 .cat {
      display: inline-block;
      margin-left: 8px;
      font-size: 10px;
      letter-spacing: 0.18em;
      color: #0d8a72;
      background: #ecfdf5;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid #99f6e4;
      vertical-align: middle;
      text-transform: uppercase;
    }
    .poc-doc table.techspec {
      margin: 10px 0 14px;
      font-size: 12px;
    }
    .poc-doc table.techspec thead th {
      background: #1a1a1a;
      color: #fff;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    .poc-doc table.techspec td.lbl {
      width: 200px;
      font-weight: 600;
      background: #f4f4f4;
      color: #444;
      font-size: 11px;
    }
    .poc-doc .tbd {
      display: inline-block;
      font-size: 10px;
      letter-spacing: 0.16em;
      color: #92400e;
      background: #fef3c7;
      padding: 1px 6px;
      border-radius: 3px;
      border: 1px solid #fde68a;
      text-transform: uppercase;
    }
    .poc-doc footer {
      margin-top: 60px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #888;
      letter-spacing: 0.1em;
      text-align: center;
    }
  `;
}
