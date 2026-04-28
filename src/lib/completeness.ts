import type { PocDocument } from '../types';

export interface SectionStatus {
  id: string;
  required: number;
  satisfied: number;
  issues: string[];
}

const has = (s: string | undefined | null) => !!(s && s.trim().length > 0);
const hasN = (s: string | undefined | null, n: number) => !!(s && s.trim().length >= n);

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

export function evaluateAll(poc: PocDocument): SectionStatus[] {
  return [
    'customer',
    'context',
    'objectives',
    'discovery',
    'timeline',
    'framework',
    'usecases',
    'dependencies',
    'tracker',
    'docs',
  ].map((id) => evaluateSection(poc, id));
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
