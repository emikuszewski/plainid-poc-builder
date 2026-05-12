import type { PocDocument } from '../types';

/**
 * Per-section summary lines for collapsed accordion headers.
 *
 * Each function returns a short one-liner the SE can scan when sections are
 * collapsed. The goal is "tell me which section this is at a glance" — not
 * a full preview, just enough to be useful.
 *
 * Returns empty string when there's nothing meaningful to show yet, so the
 * accordion can render the description in its place.
 */

const truncate = (s: string, max: number): string => {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + '…';
};

const joinDot = (parts: (string | undefined | null)[]): string =>
  parts.filter((p) => p && p.trim()).join(' · ');

export function summarizeSection(poc: PocDocument, sectionId: string): string {
  switch (sectionId) {
    case 'customer':
      return joinDot([
        poc.customerName,
        poc.customerIndustry,
        poc.customerHQ,
      ]);

    case 'context':
      // Show a snippet of the compelling event — the most important field
      // in this section. Truncate so it stays one line.
      return truncate(poc.compellingEvent, 100);

    case 'objectives':
      return truncate(poc.objectives, 100);

    case 'discovery': {
      const sysCount = poc.inScopeSystems.length;
      const idpCount = poc.identitySources.length;
      const hasOut = poc.outOfScope && poc.outOfScope.trim().length > 0;
      return joinDot([
        sysCount ? `${sysCount} system${sysCount === 1 ? '' : 's'}` : null,
        idpCount ? `${idpCount} IdP${idpCount === 1 ? '' : 's'}` : null,
        hasOut ? 'out-of-scope defined' : null,
      ]);
    }

    case 'usecases': {
      const n = poc.useCases.length;
      if (n === 0) return '';
      const titles = poc.useCases
        .map((u) => u.title)
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');
      const suffix = n > 2 ? ` +${n - 2} more` : '';
      return `${n} use case${n === 1 ? '' : 's'}${titles ? ` — ${titles}${suffix}` : ''}`;
    }

    case 'technical': {
      // How many of the use cases that need a tech spec have one?
      const needSpec = poc.useCases.filter((u) => u.category !== 'Other');
      if (needSpec.length === 0) return '';
      const filled = needSpec.filter((u) => !!u.technicalSpec).length;
      return `${filled}/${needSpec.length} spec${needSpec.length === 1 ? '' : 's'} filled`;
    }

    case 'timeline': {
      const sprintN = poc.sprints.length;
      return joinDot([
        sprintN ? `${sprintN} sprint${sprintN === 1 ? '' : 's'}` : null,
        truncate(poc.timelineSummary, 60) || null,
      ]);
    }

    case 'framework': {
      const personaN = poc.personas.length;
      const memberN = poc.teamMembers.length;
      return joinDot([
        memberN ? `${memberN} team member${memberN === 1 ? '' : 's'}` : null,
        personaN ? `${personaN} persona${personaN === 1 ? '' : 's'}` : null,
      ]);
    }

    case 'dependencies': {
      const customerHas = poc.customerResponsibilities.trim().split('\n').filter(Boolean).length;
      const plainidHas = poc.plainidResponsibilities.trim().split('\n').filter(Boolean).length;
      const openHas = poc.openItems.trim().split('\n').filter(Boolean).length;
      return joinDot([
        customerHas ? `${customerHas} customer` : null,
        plainidHas ? `${plainidHas} PlainID` : null,
        openHas ? `${openHas} open` : null,
      ]);
    }

    case 'tracker': {
      const total = poc.tracker.length;
      if (total === 0) return '';
      const inProgress = poc.tracker.filter((t) => t.status === 'In Progress').length;
      const complete = poc.tracker.filter((t) => t.status === 'Completed').length;
      return `${total} task${total === 1 ? '' : 's'} · ${complete} done · ${inProgress} in progress`;
    }

    case 'docs': {
      const n = poc.referenceDocs.length;
      return n ? `${n} doc${n === 1 ? '' : 's'}` : '';
    }

    default:
      return '';
  }
}
