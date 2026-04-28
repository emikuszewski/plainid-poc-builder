import type { PocDocument } from '../types';

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
      <h3>In-Scope Systems &amp; Platforms</h3>
      ${
        inScopeRows
          ? `<table><thead><tr><th>System / Platform</th><th>POC Focus</th><th>Priority</th></tr></thead><tbody>${inScopeRows}</tbody></table>`
          : '<p><em>None defined.</em></p>'
      }
      <h3>Identity Infrastructure</h3>
      ${idRows ? `<ul>${idRows}</ul>` : '<p><em>None defined.</em></p>'}
      ${
        poc.architectureConstraints
          ? `<h3>Architecture Constraints &amp; Design Decisions</h3>${ul(poc.architectureConstraints) || p(poc.architectureConstraints)}`
          : ''
      }
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
      <h2>Use Cases &amp; Success Criteria</h2>
      <p><strong>PlainID Platform Components Referenced:</strong> PAP (Policy Administration Point), PDP (Policy Decision Point), PIP (Policy Information Point), PEP (Policy Enforcement Point), PAA (PlainID Authorization Agent).</p>
      ${useCaseBlocks || '<p><em>No use cases defined.</em></p>'}
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
