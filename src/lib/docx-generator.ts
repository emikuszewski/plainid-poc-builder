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
} from 'docx';
import { saveAs } from 'file-saver';
import type { PocDocument } from '../types';

const lines = (s: string | undefined | null) =>
  String(s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const para = (text: string, opts: { bold?: boolean; size?: number; spacing?: { before?: number; after?: number } } = {}) =>
  new Paragraph({
    spacing: opts.spacing ?? { before: 80, after: 80 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, font: 'Calibri' })],
  });

const bulletList = (items: string[]) =>
  items.map(
    (item) =>
      new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: item, size: 22, font: 'Calibri' })],
      }),
  );

const heading = (text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]) =>
  new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: 'Calibri' })],
  });

const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const borders = { top: border, bottom: border, left: border, right: border };

const cell = (
  text: string | Paragraph[],
  opts: { width: number; bold?: boolean; bg?: string; widthDxa?: number } = { width: 0 },
) =>
  new TableCell({
    borders,
    width: { size: opts.widthDxa ?? opts.width, type: WidthType.DXA },
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children:
      Array.isArray(text)
        ? text
        : [
            new Paragraph({
              children: [new TextRun({ text, bold: opts.bold, size: 20, font: 'Calibri' })],
            }),
          ],
  });

export async function generateDocx(poc: PocDocument): Promise<Blob> {
  const customer = poc.customerName || 'Customer';
  const children: any[] = [];

  // === Cover ===
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 240 },
      children: [
        new TextRun({
          text: 'PLAINID  ·  THE AUTHORIZATION COMPANY',
          bold: true,
          color: '0A0A0A',
          size: 18,
          font: 'Calibri',
          characterSpacing: 40,
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 600, after: 100 },
      children: [
        new TextRun({ text: 'PROOF OF CONCEPT', bold: true, size: 24, color: '525252', font: 'Calibri' }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 100 },
      children: [
        new TextRun({ text: customer, bold: true, size: 64, font: 'Calibri' }),
      ],
    }),
    new Paragraph({
      spacing: { before: 300, after: 600 },
      children: [
        new TextRun({ text: 'CONFIDENTIAL', bold: true, size: 16, color: '525252', font: 'Calibri' }),
      ],
    }),
  );

  // === PlainID Overview ===
  children.push(heading('PlainID Overview', HeadingLevel.HEADING_1));
  children.push(
    para(
      'PlainID enables enterprises to modernize their access control strategy with centralized, dynamic, and scalable authorization — delivering security, operational efficiency, and regulatory compliance. We sit at the intersection of IAM, Zero Trust, and Data Security, helping organizations translate complex access requirements into business-enabling policies.',
      { size: 22 },
    ),
    para(
      'As a leader in Authorization-as-a-Service, PlainID provides a comprehensive Policy-Based Access Control (PBAC) platform to centrally manage, enforce, and audit fine-grained, dynamic access policies across Applications, APIs, Data Platforms, and Digital Services.',
      { size: 22 },
    ),
    para(
      `At our core, PlainID decouples authorization logic from applications and centralizes it into a flexible, scalable policy engine — empowering organizations like ${customer} to dynamically govern who can access what, under which conditions, based on identity, context, and risk.`,
      { size: 22 },
    ),
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

  if (poc.inScopeSystems.length) {
    children.push(heading('In-Scope Systems & Platforms', HeadingLevel.HEADING_2));
    const colW = [3120, 4680, 1560]; // sums to 9360
    const rows = [
      new TableRow({
        children: [
          cell('System / Platform', { width: colW[0], bold: true, bg: 'F4F4F4' }),
          cell('POC Focus', { width: colW[1], bold: true, bg: 'F4F4F4' }),
          cell('Priority', { width: colW[2], bold: true, bg: 'F4F4F4' }),
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
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({ text: `${s.name} — `, bold: true, size: 22, font: 'Calibri' }),
              new TextRun({ text: s.type, italics: true, size: 22, font: 'Calibri' }),
              ...(s.notes
                ? [new TextRun({ text: ` — ${s.notes}`, size: 22, font: 'Calibri' })]
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

  // === Timeline ===
  children.push(heading('POC Timeline', HeadingLevel.HEADING_1));
  for (const line of String(poc.timelineSummary || '').split(/\n\s*\n/).filter(Boolean)) {
    children.push(para(line.trim(), { size: 22 }));
  }
  if (poc.sprints.length) {
    const colW = [2080, 2080, 5200];
    const rows = [
      new TableRow({
        children: [
          cell('Phase', { width: colW[0], bold: true, bg: 'F4F4F4' }),
          cell('Weeks', { width: colW[1], bold: true, bg: 'F4F4F4' }),
          cell('Focus', { width: colW[2], bold: true, bg: 'F4F4F4' }),
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
              new TextRun({ text: `${p.name} — `, bold: true, size: 22, font: 'Calibri' }),
              new TextRun({ text: p.description, size: 22, font: 'Calibri' }),
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
        children: [
          cell('Org', { width: colW[0], bold: true, bg: 'F4F4F4' }),
          cell('Name', { width: colW[1], bold: true, bg: 'F4F4F4' }),
          cell('Role', { width: colW[2], bold: true, bg: 'F4F4F4' }),
          cell('Contact', { width: colW[3], bold: true, bg: 'F4F4F4' }),
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
                  font: 'Calibri',
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
              children: [new TextRun({ text: o, size: 20, font: 'Calibri' })],
            }),
        )
      : [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Calibri' })] })];

    const successParagraphs = lines(u.successCriteria).length
      ? lines(u.successCriteria).map(
          (o) =>
            new Paragraph({
              numbering: { reference: 'bullets', level: 0 },
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: o, size: 20, font: 'Calibri' })],
            }),
        )
      : [new Paragraph({ children: [new TextRun({ text: '—', size: 20, font: 'Calibri' })] })];

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
          cell('Phase', { width: colW[0], bold: true, bg: 'F4F4F4' }),
          cell('Task', { width: colW[1], bold: true, bg: 'F4F4F4' }),
          cell('Responsible', { width: colW[2], bold: true, bg: 'F4F4F4' }),
          cell('Status', { width: colW[3], bold: true, bg: 'F4F4F4' }),
          cell('Due', { width: colW[4], bold: true, bg: 'F4F4F4' }),
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
            new TextRun({ text: d.title, bold: true, size: 22, font: 'Calibri' }),
            new TextRun({ text: ` — ${d.url}`, color: '0d8a72', size: 22, font: 'Calibri' }),
            ...(d.description
              ? [new TextRun({ text: ` — ${d.description}`, size: 22, font: 'Calibri' })]
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
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Calibri', color: '0A0A0A' },
          paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Calibri', color: '0A0A0A' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
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
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function downloadDocx(poc: PocDocument) {
  const blob = await generateDocx(poc);
  const safe = (poc.customerName || 'POC').replace(/[^a-z0-9-_]/gi, '_');
  saveAs(blob, `PlainID_POC_${safe}.docx`);
}

export function downloadHtml(poc: PocDocument, html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const safe = (poc.customerName || 'POC').replace(/[^a-z0-9-_]/gi, '_');
  saveAs(blob, `PlainID_POC_${safe}.html`);
}
