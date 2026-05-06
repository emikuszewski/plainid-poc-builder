import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
  LevelFormat,
  Header,
  Footer,
  PageBreak,
  PageNumber,
  ImageRun,
  TabStopType,
  TabStopPosition,
  Tab,
} from 'docx';
import { saveAs } from 'file-saver';
import { embedManropeIntoDocx } from './font-embed';
import type {
  PocDocument,
  UnknownableField,
  UrlEntry,
  UseCase,
} from '../types';
import {
  CATEGORY_HAS_TECH_BLOCK,
  DOWNSTREAM_AUTHORIZER_CATEGORIES,
  findAuthorizer,
} from '../types';

// ============================================================
// Brand & layout constants
// ============================================================

const BRAND_GREEN = 'AADD00';
const TEXT_PRIMARY = '0A0A0A';
const TEXT_MUTED = '525252';
const BORDER_LIGHT = 'D9D9D9';
const TABLE_HEADER_BG = 'F5F5F5';

const LOGO_URL =
  'https://www.plainid.com/wp-content/uploads/2025/12/PlainID-logo-icon-button-2.png';

const lines = (s: string | undefined | null) =>
  String(s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Body paragraph at the canonical body size.
 */
const para = (
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    spacing?: { before?: number; after?: number };
    color?: string;
  } = {},
) =>
  new Paragraph({
    spacing: opts.spacing ?? { before: 100, after: 100 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? 22,
        font: 'Manrope',
        color: opts.color,
      }),
    ],
  });

/**
 * Auto-detect the "**Term** — explanation" pattern in a single bullet.
 *
 * If the line contains an em-dash with surrounding spaces (the convention used
 * across PlainID POC docs), bold the lead-in part. Falls back to plain text
 * if no em-dash is present. Hyphen and en-dash are intentionally NOT detected
 * to reduce false positives — only the proper em-dash (` — `) qualifies.
 */
function bulletWithLeadIn(text: string): Paragraph {
  const emDashIdx = text.indexOf(' — ');
  if (emDashIdx > 0 && emDashIdx < 80) {
    const lead = text.slice(0, emDashIdx);
    const rest = text.slice(emDashIdx); // includes ' — '
    return new Paragraph({
      numbering: { reference: 'bullets', level: 0 },
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({ text: lead, bold: true, size: 22, font: 'Manrope' }),
        new TextRun({ text: rest, size: 22, font: 'Manrope' }),
      ],
    });
  }
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, font: 'Manrope' })],
  });
}

const bulletList = (items: string[]) => items.map(bulletWithLeadIn);

const heading = (text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]) =>
  new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: 'Manrope' })],
  });

/**
 * Brand accent rule: a thin lime-green horizontal bar used under the logo on
 * the cover and at section breaks. Implemented as a bottom-bordered empty
 * paragraph since docx.js doesn't expose horizontal-rule primitives directly.
 */
const accentRule = () =>
  new Paragraph({
    spacing: { before: 120, after: 240 },
    border: {
      bottom: { color: BRAND_GREEN, style: BorderStyle.SINGLE, size: 12, space: 1 },
    },
    children: [new TextRun({ text: '', font: 'Manrope' })],
  });

/**
 * Fetch the PlainID logo PNG as a buffer once. Browser CORS-safe because
 * the PlainID WP host serves with permissive CORS for static assets.
 * Returns null on failure — generator falls back to typographic mark.
 */
async function fetchLogoBuffer(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

const border = { style: BorderStyle.SINGLE, size: 4, color: BORDER_LIGHT };
const borders = { top: border, bottom: border, left: border, right: border };

const cell = (
  text: string | Paragraph[],
  opts: { width: number; bold?: boolean; bg?: string; widthDxa?: number } = { width: 0 },
) =>
  new TableCell({
    borders,
    width: { size: opts.widthDxa ?? opts.width, type: WidthType.DXA },
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children:
      Array.isArray(text)
        ? text
        : [
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  bold: opts.bold,
                  size: 20,
                  font: 'Manrope',
                  color: opts.bold ? TEXT_PRIMARY : TEXT_MUTED,
                }),
              ],
            }),
          ],
  });

export async function generateDocx(poc: PocDocument): Promise<Blob> {
  const customer = poc.customerName || 'Customer';
  const dateStr = formatDate(new Date());

  // Fetch the logo for embedding (best-effort; falls back to typographic mark)
  const logoBuffer = await fetchLogoBuffer();

  // ---- Cover (lives in its own section — no header/footer, page break after) ----
  const coverChildren: any[] = [];

  // Vertical breathing room above the logo (visually centers the cover)
  coverChildren.push(
    new Paragraph({
      spacing: { before: 2400, after: 0 },
      children: [new TextRun({ text: '', font: 'Manrope' })],
    }),
  );

  if (logoBuffer) {
    // Icon stacked above the wordmark — both centered. This avoids the
    // visual right-shift caused by inline icon+text in a single paragraph.
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [
          new ImageRun({
            data: logoBuffer,
            // Type assertion: docx.js types are missing 'png' in some versions
            type: 'png' as any,
            transformation: { width: 64, height: 64 },
          }) as any,
        ],
      }),
    );
  }

  // Wordmark — always rendered (sits below icon when icon is present,
  // alone when logo fetch failed).
  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({
          text: 'Plain',
          size: 56,
          font: 'Manrope',
          color: TEXT_PRIMARY,
        }),
        new TextRun({
          text: 'ID',
          size: 56,
          bold: true,
          font: 'Manrope',
          color: TEXT_PRIMARY,
        }),
      ],
    }),
  );

  // Tagline under the wordmark
  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      children: [
        new TextRun({
          text: 'THE AUTHORIZATION COMPANY',
          color: TEXT_MUTED,
          size: 18,
          font: 'Manrope SemiBold',
          characterSpacing: 40,
        }),
      ],
    }),
  );

  // Lime accent bar
  coverChildren.push(accentRule());

  // Main cover title block
  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: 'PROOF OF CONCEPT',
          size: 28,
          color: TEXT_MUTED,
          font: 'Manrope SemiBold',
          characterSpacing: 40,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 200 },
      children: [
        new TextRun({
          text: customer,
          bold: true,
          size: 64,
          font: 'Manrope',
          color: TEXT_PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 360 },
      children: [
        new TextRun({
          text: dateStr,
          size: 28,
          color: TEXT_MUTED,
          font: 'Manrope',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 0 },
      children: [
        new TextRun({
          text: 'CONFIDENTIAL',
          bold: true,
          size: 22,
          color: BRAND_GREEN,
          font: 'Manrope',
          characterSpacing: 80,
        }),
      ],
    }),
  );

  // ---- Body content ----
  const children: any[] = [];

  // === PlainID Overview ===
  children.push(heading('PlainID Overview', HeadingLevel.HEADING_1));
  children.push(
    para(
      'PlainID enables enterprises to modernize their access control strategy with centralized, dynamic, and scalable authorization — delivering security, operational efficiency, and regulatory compliance. We sit at the intersection of IAM, Zero Trust, and Data Security, helping organizations translate complex access requirements into business-enabling policies.',
    ),
    para(
      'As a leader in Authorization-as-a-Service, PlainID provides a comprehensive Policy-Based Access Control (PBAC) platform to centrally manage, enforce, and audit fine-grained, dynamic access policies across Applications, APIs, Data Platforms, and Digital Services.',
    ),
    para(
      `At our core, PlainID decouples authorization logic from applications and centralizes it into a flexible, scalable policy engine — empowering organizations like ${customer} to dynamically govern who can access what, under which conditions, based on identity, context, and risk.`,
    ),
  );

  // === Common Business Drivers (boilerplate, customer-name interpolated) ===
  children.push(heading('Common Business Drivers', HeadingLevel.HEADING_2));
  children.push(
    ...bulletList([
      'Dynamic, Fine-Grained Access Control — Enforce real-time decisions based on user identity, attributes (department, role, clearance), environment, and risk signals.',
      'Zero Trust Architecture (ZTA) Enablement — Centralize authorization to support least-privilege access and continuous validation.',
      'Data Security & Governance Compliance — Provide transparent, explainable policies for audit and regulatory review (SOX, GDPR, CCPA, etc.).',
      'Role Consolidation & Policy Migration — Convert legacy role-based access models into dynamic, attribute-driven PBAC policies at scale.',
      'Data Platform Authorization — Govern access to Databricks, Snowflake, and other data platforms through unified policy enforcement.',
      'API Gateway Integration — Manage authorization uniformly behind API gateways without embedding logic in backend services.',
      'Accelerating Data & AI Initiatives — Secure data access for analytics, AI systems, and APIs while supporting dynamic, attribute-based controls on sensitive datasets.',
      'Faster Cloud & SaaS Adoption — Provide consistent authorization across hybrid and multi-cloud environments.',
    ]),
  );

  // === Customer Overview ===
  children.push(heading(`${customer} Overview`, HeadingLevel.HEADING_1));
  for (const line of String(poc.customerOverview || '').split(/\n\s*\n/).filter(Boolean)) {
    children.push(para(line.trim(), { size: 22 }));
  }

  // === Authorization Context ===
  children.push(heading('Authorization Context & Compelling Event', HeadingLevel.HEADING_2));
  for (const line of String(poc.compellingEvent || '').split(/\n\s*\n/).filter(Boolean)) {
    children.push(para(line.trim(), { size: 22 }));
  }
  if (poc.authorizationContext) {
    for (const line of String(poc.authorizationContext).split(/\n\s*\n/).filter(Boolean)) {
      children.push(para(line.trim(), { size: 22 }));
    }
  }

  // === Objectives ===
  children.push(heading('POC Objectives & Outcomes', HeadingLevel.HEADING_1));
  for (const line of String(poc.objectives || '').split(/\n\s*\n/).filter(Boolean)) {
    children.push(para(line.trim(), { size: 22 }));
  }

  if (lines(poc.whatToValidate).length) {
    children.push(heading(`What ${customer} Will Validate`, HeadingLevel.HEADING_2));
    children.push(...bulletList(lines(poc.whatToValidate)));
  }

  if (lines(poc.postPocDeliverables).length) {
    children.push(heading('Post-POC Deliverables from PlainID', HeadingLevel.HEADING_2));
    children.push(...bulletList(lines(poc.postPocDeliverables)));
  }

  // === Discovery Summary ===
  children.push(heading('Discovery Summary', HeadingLevel.HEADING_1));

  if (poc.tenantStrategy && poc.tenantStrategy.trim()) {
    children.push(heading('Tenant Strategy', HeadingLevel.HEADING_2));
    for (const line of String(poc.tenantStrategy).split(/\n\s*\n/).filter(Boolean)) {
      children.push(para(line.trim()));
    }
  }

  if (poc.inScopeSystems.length) {
    children.push(heading('In-Scope Systems & Platforms', HeadingLevel.HEADING_2));
    const colW = [3120, 4680, 1560]; // sums to 9360
    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          cell('System / Platform', { width: colW[0], bold: true, bg: TABLE_HEADER_BG }),
          cell('POC Focus', { width: colW[1], bold: true, bg: TABLE_HEADER_BG }),
          cell('Priority', { width: colW[2], bold: true, bg: TABLE_HEADER_BG }),
        ],
      }),
      ...poc.inScopeSystems.map(
        (s) =>
          new TableRow({
            children: [
              cell(s.name, { width: colW[0], bold: true }),
              cell(s.focus, { width: colW[1] }),
              cell(s.priority, { width: colW[2] }),
            ],
          }),
      ),
    ];
    children.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: colW,
        rows,
      }),
    );
  }

  if (poc.identitySources.length) {
    children.push(heading('Identity Infrastructure', HeadingLevel.HEADING_2));
    children.push(
      ...poc.identitySources.map(
        (s) =>
          new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({ text: `${s.name} — `, bold: true, size: 22, font: 'Manrope' }),
              new TextRun({ text: s.type, italics: true, size: 22, font: 'Manrope' }),
              ...(s.notes
                ? [new TextRun({ text: ` — ${s.notes}`, size: 22, font: 'Manrope' })]
                : []),
            ],
          }),
      ),
    );
  }

  if (lines(poc.architectureConstraints).length) {
    children.push(heading('Architecture Constraints & Design Decisions', HeadingLevel.HEADING_2));
    children.push(...bulletList(lines(poc.architectureConstraints)));
  }

  if (lines(poc.outOfScope).length) {
    children.push(heading('Out of Scope', HeadingLevel.HEADING_2));
    children.push(
      para(
        'The following items have been discussed and are explicitly out of scope for this POC. Listed here for traceability and to keep the engagement focused.',
        { color: TEXT_MUTED },
      ),
    );
    children.push(...bulletList(lines(poc.outOfScope)));
  }

  // === Use Cases ===
  children.push(heading('Use Cases & Success Criteria', HeadingLevel.HEADING_1));
  children.push(
    para(
      'PlainID Platform Components Referenced: PAP (Policy Administration Point), PDP (Policy Decision Point), PIP (Policy Information Point), PEP (Policy Enforcement Point), PAA (PlainID Authorization Agent).',
      { size: 22 },
    ),
  );

  poc.useCases.forEach((u, i) => {
    const colW = [2340, 7020];
    const titleRow = new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 9360, type: WidthType.DXA },
          columnSpan: 2,
          shading: { fill: '0A0A0A', type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: `Use Case ${i + 1}: ${u.title}`,
                  bold: true,
                  color: 'FFFFFF',
                  size: 22,
                  font: 'Manrope',
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const personaRow = new TableRow({
      children: [
        cell('Persona', { width: colW[0], bold: true, bg: 'FAFAFA' }),
        cell(u.persona || '—', { width: colW[1] }),
      ],
    });

    const objectivesParagraphs = lines(u.objectives).length
      ? lines(u.objectives).map(
          (o) =>
            new Paragraph({
              numbering: { reference: 'bullets', level: 0 },
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: o, size: 20, font: 'Manrope' })],
            }),
        )
      : [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Manrope' })] })];

    const successParagraphs = lines(u.successCriteria).length
      ? lines(u.successCriteria).map(
          (o) =>
            new Paragraph({
              numbering: { reference: 'bullets', level: 0 },
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: o, size: 20, font: 'Manrope' })],
            }),
        )
      : [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Manrope' })] })];

    const objectivesRow = new TableRow({
      children: [
        cell('Objectives', { width: colW[0], bold: true, bg: 'FAFAFA' }),
        cell(objectivesParagraphs, { width: colW[1] }),
      ],
    });

    const successRow = new TableRow({
      children: [
        cell('Success Criteria', { width: colW[0], bold: true, bg: 'FAFAFA' }),
        cell(successParagraphs, { width: colW[1] }),
      ],
    });

    children.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: colW,
        rows: [titleRow, personaRow, objectivesRow, successRow],
      }),
    );
    children.push(para('', { size: 12 })); // breather
  });

  // === Technical Foundation ===
  children.push(heading('Technical Foundation', HeadingLevel.HEADING_1));
  children.push(
    para(
      "Authorizer config and the specs PlainID needs to integrate. Identity context applies to every use case; per-use-case blocks cover authorizer-specific and category-specific details.",
      { size: 22 },
    ),
  );
  // Universal block — once per POC
  {
    const tf = poc.technicalFoundation;
    const rows: TableRow[] = [specTitleRow('Universal — Identity & Test Users')];
    rows.push(specRow('JWT / OIDC Samples', urlEntriesParagraphs(tf?.jwtSampleUrls)));
    rows.push(
      specRow(
        'Identity Attributes',
        ufParagraphs(tf?.identityAttributeCatalog),
      ),
    );
    rows.push(specRow('Test Users', ufParagraphs(tf?.testUserAccounts)));
    pushTable(children, rows);
  }
  const techUseCases = poc.useCases.filter((u) => CATEGORY_HAS_TECH_BLOCK[u.category]);
  if (techUseCases.length === 0) {
    children.push(para('No technical-spec use cases defined.', { size: 22 }));
  } else {
    techUseCases.forEach((u, i) => {
      pushTechBlockForUseCase(children, u, i, poc.useCases);
    });
  }

  // === Timeline ===
  children.push(heading('POC Timeline', HeadingLevel.HEADING_1));
  for (const line of String(poc.timelineSummary || '').split(/\n\s*\n/).filter(Boolean)) {
    children.push(para(line.trim(), { size: 22 }));
  }
  if (poc.sprints.length) {
    const colW = [2080, 2080, 5200];
    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          cell('Phase', { width: colW[0], bold: true, bg: TABLE_HEADER_BG }),
          cell('Weeks', { width: colW[1], bold: true, bg: TABLE_HEADER_BG }),
          cell('Focus', { width: colW[2], bold: true, bg: TABLE_HEADER_BG }),
        ],
      }),
      ...poc.sprints.map(
        (s) =>
          new TableRow({
            children: [
              cell(s.phase, { width: colW[0], bold: true }),
              cell(s.weeks, { width: colW[1] }),
              cell(s.focus, { width: colW[2] }),
            ],
          }),
      ),
    ];
    children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: colW, rows }));
  }

  // === Framework ===
  children.push(heading('POC Framework', HeadingLevel.HEADING_1));
  children.push(heading('Collaboration Model', HeadingLevel.HEADING_2));
  for (const line of String(poc.cadence || '').split(/\n\s*\n/).filter(Boolean)) {
    children.push(para(line.trim(), { size: 22 }));
  }

  if (poc.personas.length) {
    children.push(heading('Test Personas', HeadingLevel.HEADING_2));
    children.push(
      ...poc.personas.map(
        (p) =>
          new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({ text: `${p.name} — `, bold: true, size: 22, font: 'Manrope' }),
              new TextRun({ text: p.description, size: 22, font: 'Manrope' }),
            ],
          }),
      ),
    );
  }

  if (poc.teamMembers.length) {
    children.push(heading('POC Team Members & Responsibilities', HeadingLevel.HEADING_2));
    const colW = [1872, 2496, 2496, 2496];
    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          cell('Org', { width: colW[0], bold: true, bg: TABLE_HEADER_BG }),
          cell('Name', { width: colW[1], bold: true, bg: TABLE_HEADER_BG }),
          cell('Role', { width: colW[2], bold: true, bg: TABLE_HEADER_BG }),
          cell('Contact', { width: colW[3], bold: true, bg: TABLE_HEADER_BG }),
        ],
      }),
      ...poc.teamMembers.map(
        (m) =>
          new TableRow({
            children: [
              cell(m.org, { width: colW[0] }),
              cell(m.name, { width: colW[1], bold: true }),
              cell(m.role, { width: colW[2] }),
              cell(m.email, { width: colW[3] }),
            ],
          }),
      ),
    ];
    children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: colW, rows }));
  }

  // === Dependencies ===
  children.push(heading('POC Dependencies & Pre-Requisites', HeadingLevel.HEADING_1));

  children.push(heading(`${customer} Responsibilities`, HeadingLevel.HEADING_2));
  if (lines(poc.customerResponsibilities).length) {
    children.push(...bulletList(lines(poc.customerResponsibilities)));
  } else {
    children.push(para('—', { size: 22 }));
  }

  children.push(heading('PlainID Responsibilities', HeadingLevel.HEADING_2));
  if (lines(poc.plainidResponsibilities).length) {
    children.push(...bulletList(lines(poc.plainidResponsibilities)));
  } else {
    children.push(para('—', { size: 22 }));
  }

  if (lines(poc.openItems).length) {
    children.push(heading('Open Items to Resolve', HeadingLevel.HEADING_2));
    children.push(...bulletList(lines(poc.openItems)));
  }

  // === Tracker ===
  children.push(heading('POC Tracker', HeadingLevel.HEADING_1));
  if (poc.tracker.length) {
    const colW = [1872, 3120, 1872, 1248, 1248];
    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          cell('Phase', { width: colW[0], bold: true, bg: TABLE_HEADER_BG }),
          cell('Task', { width: colW[1], bold: true, bg: TABLE_HEADER_BG }),
          cell('Responsible', { width: colW[2], bold: true, bg: TABLE_HEADER_BG }),
          cell('Status', { width: colW[3], bold: true, bg: TABLE_HEADER_BG }),
          cell('Due', { width: colW[4], bold: true, bg: TABLE_HEADER_BG }),
        ],
      }),
      ...poc.tracker.map(
        (t) =>
          new TableRow({
            children: [
              cell(t.phase, { width: colW[0] }),
              cell(t.task, { width: colW[1] }),
              cell(t.responsible, { width: colW[2] }),
              cell(t.status, { width: colW[3] }),
              cell(t.dueDate || '—', { width: colW[4] }),
            ],
          }),
      ),
    ];
    children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: colW, rows }));
  }

  // === Reference Docs ===
  children.push(heading('Reference Documentation', HeadingLevel.HEADING_1));
  children.push(
    ...poc.referenceDocs.map(
      (d) =>
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({ text: d.title, bold: true, size: 22, font: 'Manrope' }),
            new TextRun({ text: ` — ${d.url}`, color: '0d8a72', size: 22, font: 'Manrope' }),
            ...(d.description
              ? [new TextRun({ text: ` — ${d.description}`, size: 22, font: 'Manrope' })]
              : []),
          ],
        }),
    ),
  );

  // === Document config ===
  const doc = new Document({
    creator: 'PlainID POC Builder',
    title: `PlainID POC — ${customer}`,
    styles: {
      default: { document: { run: { font: 'Manrope', size: 22, color: TEXT_PRIMARY } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Manrope', color: TEXT_PRIMARY },
          paragraph: {
            spacing: { before: 480, after: 200 },
            outlineLevel: 0,
            border: {
              bottom: { color: BRAND_GREEN, style: BorderStyle.SINGLE, size: 8, space: 4 },
            },
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Manrope', color: TEXT_PRIMARY },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      // ---- Cover (no header/footer, no page number) ----
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 },
          },
          titlePage: false,
        },
        children: coverChildren,
      },
      // ---- Body (header on every page, footer with page number) ----
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                spacing: { before: 0, after: 80 },
                border: {
                  bottom: { color: BRAND_GREEN, style: BorderStyle.SINGLE, size: 6, space: 4 },
                },
                children: [
                  new TextRun({
                    text: `${customer} POC | Confidential`,
                    size: 18,
                    color: TEXT_MUTED,
                    font: 'Manrope',
                  }),
                  new TextRun({
                    children: [new Tab(), dateStr],
                    size: 18,
                    color: TEXT_MUTED,
                    font: 'Manrope',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                spacing: { before: 80, after: 0 },
                border: {
                  top: { color: BORDER_LIGHT, style: BorderStyle.SINGLE, size: 4, space: 4 },
                },
                children: [
                  new TextRun({
                    text: '© 2026 PlainID Ltd. All rights reserved | Confidential',
                    size: 16,
                    color: TEXT_MUTED,
                    font: 'Manrope',
                  }),
                  new TextRun({
                    children: [new Tab(), 'Page '],
                    size: 16,
                    color: TEXT_MUTED,
                    font: 'Manrope',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: TEXT_MUTED,
                    font: 'Manrope',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/**
 * "March 2026" style — month name + 4-digit year, no day. Matches the
 * cover-page convention used in TI/PlainID POC documents.
 */
function formatDate(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// ============================================================
// Technical Foundation: per-use-case rendering helper
// ============================================================

const ufText = (f: UnknownableField | undefined): string => {
  if (!f) return '—';
  if (f.unknown) return 'TBD — to be resolved during POC';
  return f.value || '—';
};

function ufParagraphs(f: UnknownableField | undefined): Paragraph[] {
  if (!f) {
    return [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Manrope' })] })];
  }
  if (f.unknown) {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: 'TBD — to be resolved during POC',
            size: 20,
            font: 'Manrope',
            color: '92400E',
            italics: true,
          }),
        ],
      }),
    ];
  }
  const items = lines(f.value);
  if (items.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Manrope' })] })];
  }
  if (items.length === 1) {
    return [
      new Paragraph({
        children: [new TextRun({ text: items[0], size: 20, font: 'Manrope' })],
      }),
    ];
  }
  return items.map(
    (l) =>
      new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { before: 30, after: 30 },
        children: [new TextRun({ text: l, size: 20, font: 'Manrope' })],
      }),
  );
}

function urlEntriesParagraphs(entries: UrlEntry[] | undefined): Paragraph[] {
  if (!entries || entries.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Manrope' })] })];
  }
  return entries.map(
    (e) =>
      new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { before: 30, after: 30 },
        children: [
          new TextRun({ text: `${e.label || 'URL'} — `, bold: true, size: 20, font: 'Manrope' }),
          new TextRun({ text: e.url, size: 20, font: 'Manrope', color: '0D8A72' }),
          ...(e.notes
            ? [new TextRun({ text: ` — ${e.notes}`, size: 20, font: 'Manrope', italics: true })]
            : []),
        ],
      }),
  );
}

// Render a single labeled row in a tech-spec table
function specRow(label: string, value: string | Paragraph[]): TableRow {
  const labelW = 2340;
  const valueW = 7020;
  return new TableRow({
    children: [
      cell(label, { width: labelW, bold: true, bg: 'FAFAFA' }),
      cell(value, { width: valueW }),
    ],
  });
}

// Render a section title row spanning both columns
function specTitleRow(text: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        borders,
        width: { size: 9360, type: WidthType.DXA },
        columnSpan: 2,
        shading: { fill: '0A0A0A', type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        children: [
          new Paragraph({
            children: [
              new TextRun({ text, bold: true, color: 'FFFFFF', size: 22, font: 'Manrope' }),
            ],
          }),
        ],
      }),
    ],
  });
}

function pushTable(children: any[], rows: TableRow[]) {
  children.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2340, 7020],
      rows,
    }),
  );
  children.push(para('', { size: 10 })); // small breather
}

function pushTechBlockForUseCase(
  children: any[],
  u: UseCase,
  idx: number,
  allUseCases: UseCase[],
) {
  const spec = u.technicalSpec;
  if (!spec) return;

  const isDownstream = DOWNSTREAM_AUTHORIZER_CATEGORIES.includes(u.category);

  // Per-use-case header
  children.push(
    new Paragraph({
      spacing: { before: 240, after: 80 },
      children: [
        new TextRun({
          text: u.title || '(untitled)',
          bold: true,
          size: 24,
          font: 'Manrope',
        }),
        new TextRun({
          text: `   ${u.category.toUpperCase()}`,
          size: 18,
          font: 'Manrope',
          color: '0D8A72',
          bold: true,
          characterSpacing: 30,
        }),
      ],
    }),
  );

  // ----- Authorizer block (skip for Identity / Compliance) -----
  if (!isDownstream) {
    const a = spec.authorizer;
    const catalogEntry = findAuthorizer(a.selectedAuthorizerId);
    const authorizerName =
      a.selectedAuthorizerId === 'custom'
        ? a.customAuthorizerName.unknown
          ? 'TBD'
          : a.customAuthorizerName.value || 'Custom (unnamed)'
        : catalogEntry?.name ?? a.selectedAuthorizerId;

    const rows: TableRow[] = [specTitleRow(`Authorizer · ${authorizerName}`)];
    if (catalogEntry) {
      rows.push(
        specRow('Description', [
          new Paragraph({
            children: [
              new TextRun({
                text: catalogEntry.shortDescription,
                italics: true,
                size: 20,
                font: 'Manrope',
              }),
            ],
          }),
        ]),
      );
    }
    rows.push(specRow('Version', ufText(a.version)));
    rows.push(specRow('Enforcement Mode', ufText(a.enforcementMode)));
    rows.push(specRow('Deployment Topology', ufText(a.deploymentTopology)));
    rows.push(specRow('Deployment Target', ufText(a.deploymentTarget)));
    rows.push(specRow('PDP Endpoint', ufText(a.pdpEndpoint)));
    rows.push(specRow('Network Path', ufText(a.networkPath)));
    rows.push(specRow('Identity Source Paths', ufParagraphs(a.identitySourcePaths)));
    rows.push(specRow('Required PIP Integrations', ufParagraphs(a.requiredPipIntegrations)));
    rows.push(specRow('Credentials Location', ufText(a.credentialsLocation)));
    rows.push(specRow('Credentials Provisioner', ufText(a.credentialsProvisioner)));
    rows.push(specRow('Failure Mode', ufText(a.failureMode)));
    rows.push(specRow('Performance Budget', ufText(a.performanceBudget)));
    rows.push(specRow('Sample Request / Response', ufParagraphs(a.sampleRequestResponse)));
    rows.push(specRow('Authorizer Documentation', urlEntriesParagraphs(a.authorizerDocs)));
    rows.push(specRow('Open Items', ufParagraphs(a.openItems)));
    pushTable(children, rows);
  }

  // ----- Per-category block -----
  if (u.category === 'Data' && spec.data) {
    const d = spec.data;
    const rows: TableRow[] = [specTitleRow('Data Layer Specifics')];
    rows.push(specRow('Catalog Scope', ufParagraphs(d.catalogScope)));
    rows.push(specRow('Classification Taxonomy', ufParagraphs(d.classificationTaxonomy)));
    rows.push(specRow('Classification Docs', urlEntriesParagraphs(d.classificationDocsUrls)));
    rows.push(specRow('Sample Queries', ufParagraphs(d.sampleQueries)));
    rows.push(specRow('Connection Method', ufParagraphs(d.connectionMethod)));
    rows.push(specRow('Existing Access Control', ufParagraphs(d.existingAccessControl)));
    rows.push(specRow('Performance Baseline', ufText(d.performanceBaseline)));
    rows.push(specRow('Data Residency Constraints', ufParagraphs(d.dataResidencyConstraints)));
    pushTable(children, rows);
  } else if (u.category === 'API Gateway' && spec.apiGateway) {
    const g = spec.apiGateway;
    const rows: TableRow[] = [specTitleRow('API Gateway Specifics')];
    rows.push(specRow('API Specifications', urlEntriesParagraphs(g.apiCatalogUrls)));
    rows.push(specRow('Endpoint Resource Model', ufParagraphs(g.endpointResourceModel)));
    rows.push(specRow('Auth Pattern Today', ufParagraphs(g.authPatternToday)));
    rows.push(specRow('Token Flow', ufParagraphs(g.tokenFlow)));
    rows.push(specRow('Gateway Version', ufText(g.gatewayVersion)));
    rows.push(specRow('Existing Gateway Policies', ufParagraphs(g.existingPolicies)));
    rows.push(specRow('Backend Trust Model', ufText(g.backendTrustModel)));
    rows.push(specRow('Latency SLA', ufText(g.latencySla)));
    pushTable(children, rows);
  } else if (u.category === 'AI Authorization' && spec.aiAuth) {
    const ai = spec.aiAuth;
    const rows: TableRow[] = [specTitleRow('AI Authorization Specifics')];
    rows.push(specRow('Agent Topology', ufParagraphs(ai.agentTopology)));
    rows.push(specRow('Tool Inventory Specs', urlEntriesParagraphs(ai.toolInventoryUrls)));
    rows.push(specRow('Tool Inventory Notes', ufParagraphs(ai.toolInventoryNotes)));
    rows.push(specRow('Calling Identity Propagation', ufParagraphs(ai.callingIdentityPropagation)));
    rows.push(specRow('RAG Sources', ufParagraphs(ai.ragSourcesInScope)));
    rows.push(specRow('Agent Runtime', ufParagraphs(ai.agentRuntime)));
    rows.push(specRow('MCP Transport', ufText(ai.mcpTransport)));
    rows.push(specRow('LLM Provider', ufParagraphs(ai.llmProvider)));
    rows.push(specRow('Failure Mode Policy', ufParagraphs(ai.failureModePolicy)));
    pushTable(children, rows);
  } else if (u.category === 'Application' && spec.application) {
    const ap = spec.application;
    const rows: TableRow[] = [specTitleRow('Application Specifics')];
    rows.push(specRow('App Architecture', ufParagraphs(ap.appArchitecture)));
    rows.push(specRow('Resource Model', ufParagraphs(ap.resourceModel)));
    rows.push(specRow('Existing Authorization', ufParagraphs(ap.existingAuthorization)));
    rows.push(specRow('Session Model', ufParagraphs(ap.sessionModel)));
    rows.push(specRow('Build & Deploy', ufParagraphs(ap.buildDeploy)));
    rows.push(specRow('Domain-Specific Rules', ufParagraphs(ap.domainSpecificRules)));
    pushTable(children, rows);
  } else if (u.category === 'Identity' && spec.identity) {
    const i = spec.identity;
    const downstream = i.downstreamAuthorizerUseCaseIds
      .map((id) => allUseCases.find((c) => c.id === id))
      .filter(Boolean) as UseCase[];
    const downstreamParagraphs: Paragraph[] = downstream.length
      ? downstream.map((d) => {
          const auth = d.technicalSpec
            ? findAuthorizer(d.technicalSpec.authorizer.selectedAuthorizerId)
            : undefined;
          return new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            spacing: { before: 30, after: 30 },
            children: [
              new TextRun({ text: d.title || '(untitled)', bold: true, size: 20, font: 'Manrope' }),
              new TextRun({ text: ` — ${d.category}`, size: 20, font: 'Manrope', italics: true }),
              ...(auth
                ? [new TextRun({ text: ` · ${auth.name}`, size: 20, font: 'Manrope' })]
                : []),
            ],
          });
        })
      : [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Manrope' })] })];
    const rows: TableRow[] = [specTitleRow('Identity Specifics')];
    rows.push(specRow('Downstream Authorizers', downstreamParagraphs));
    rows.push(specRow('Role Inventory', ufParagraphs(i.roleInventory)));
    rows.push(specRow('Group Membership Volume', ufParagraphs(i.groupMembershipVolume)));
    rows.push(specRow('Lifecycle Integration', ufParagraphs(i.lifecycleIntegration)));
    rows.push(specRow('Source-of-Truth Mapping', ufParagraphs(i.sourceOfTruthMapping)));
    rows.push(specRow('Federation Boundaries', ufParagraphs(i.federationBoundaries)));
    pushTable(children, rows);
  } else if (u.category === 'Compliance' && spec.compliance) {
    const c = spec.compliance;
    const downstream = c.downstreamAuthorizerUseCaseIds
      .map((id) => allUseCases.find((c2) => c2.id === id))
      .filter(Boolean) as UseCase[];
    const downstreamParagraphs: Paragraph[] = downstream.length
      ? downstream.map((d) => {
          const auth = d.technicalSpec
            ? findAuthorizer(d.technicalSpec.authorizer.selectedAuthorizerId)
            : undefined;
          return new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            spacing: { before: 30, after: 30 },
            children: [
              new TextRun({ text: d.title || '(untitled)', bold: true, size: 20, font: 'Manrope' }),
              new TextRun({ text: ` — ${d.category}`, size: 20, font: 'Manrope', italics: true }),
              ...(auth
                ? [new TextRun({ text: ` · ${auth.name}`, size: 20, font: 'Manrope' })]
                : []),
            ],
          });
        })
      : [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Manrope' })] })];
    const rows: TableRow[] = [specTitleRow('Compliance Specifics')];
    rows.push(specRow('Authorizers Under Audit', downstreamParagraphs));
    rows.push(specRow('Regulation Set', ufParagraphs(c.regulationSet)));
    rows.push(specRow('Existing Audit Pipeline', ufParagraphs(c.existingAuditPipeline)));
    rows.push(specRow('Retention Requirements', ufText(c.retentionRequirements)));
    rows.push(specRow('Sample Audit Questions', ufParagraphs(c.sampleAuditQuestions)));
    rows.push(specRow('Reviewer Personas', ufParagraphs(c.reviewerPersonas)));
    pushTable(children, rows);
  }
}

export async function downloadDocx(poc: PocDocument) {
  const rawBlob = await generateDocx(poc);
  // Post-process to embed Manrope so the doc looks correct on machines
  // without Manrope installed. If embedding fails for any reason we serve
  // the unembedded blob (still valid; renders in fallback font).
  const blob = await embedManropeIntoDocx(rawBlob);
  const safe = (poc.customerName || 'POC').replace(/[^a-z0-9-_]/gi, '_');
  saveAs(blob, `PlainID_POC_${safe}.docx`);
}

export function downloadHtml(poc: PocDocument, html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const safe = (poc.customerName || 'POC').replace(/[^a-z0-9-_]/gi, '_');
  saveAs(blob, `PlainID_POC_${safe}.html`);
}
