import { client } from './client';
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import type {
  AdminDefaultTrackerTask,
  AdminDefaultResponsibility,
  AdminDefaultPersona,
  AdminDefaultReferenceDoc,
  AdminDefaultSprint,
  AdminDefaultBoilerplate,
  AdminAuditLogEntry,
} from '../types';

/**
 * Admin defaults — shared catalogs maintained by the team that seed new POCs.
 *
 * Each admin category has its own list/create/update/softDelete wrapper here.
 * All writes also push an audit-log entry via writeAudit() so the Activity
 * tab shows what changed and who changed it.
 *
 * Reads filter out soft-deleted rows (isDeleted=true) — the audit log keeps
 * the history; the consumer-facing list doesn't show tombstones.
 */

// ------------------------------------------------------------
// Current user identity (for audit logs)
// ------------------------------------------------------------

async function currentUserEmail(): Promise<string> {
  try {
    const session = await fetchAuthSession();
    const email = session.tokens?.idToken?.payload?.email as string | undefined;
    if (email) return email;
  } catch {
    /* ignore */
  }
  try {
    const user = await getCurrentUser();
    return user.signInDetails?.loginId ?? user.username ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ------------------------------------------------------------
// Audit log
// ------------------------------------------------------------

interface AuditInput {
  action: 'create' | 'update' | 'delete';
  modelName: string;
  recordId: string;
  summary: string;
  snapshot?: unknown;
}

async function writeAudit(input: AuditInput): Promise<void> {
  const userEmail = await currentUserEmail();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = client;
    await c.models.AdminAuditLog.create({
      userEmail,
      action: input.action,
      modelName: input.modelName,
      recordId: input.recordId,
      summary: input.summary,
      snapshotJson: input.snapshot ? JSON.stringify(input.snapshot) : null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Audit failures shouldn't fail the user's edit; log to console only.
    // eslint-disable-next-line no-console
    console.warn('audit log write failed', err);
  }
}

export async function listAuditLog(limit = 100): Promise<AdminAuditLogEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminAuditLog.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'audit list failed');
  // Sort newest first by timestamp, take the latest `limit` entries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = (data ?? []).slice().sort((a: any, b: any) =>
    (b.timestamp ?? '').localeCompare(a.timestamp ?? ''),
  );
  return sorted.slice(0, limit) as AdminAuditLogEntry[];
}

// ------------------------------------------------------------
// Generic list helper — strips soft-deleted rows, sorts by sortOrder
// ------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function liveAndSorted<T extends { isDeleted?: boolean | null; sortOrder?: number }>(rows: any[]): T[] {
  return rows
    .filter((r) => !r.isDeleted)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) as T[];
}

// ============================================================
// Tracker tasks
// ============================================================

export async function listTrackerTasks(): Promise<AdminDefaultTrackerTask[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultTrackerTask.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return liveAndSorted<AdminDefaultTrackerTask>(data ?? []);
}

export async function createTrackerTask(
  input: Omit<AdminDefaultTrackerTask, 'id' | 'isDeleted'>,
): Promise<AdminDefaultTrackerTask> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultTrackerTask.create({
    ...input,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultTrackerTask',
    recordId: data.id,
    summary: `Added tracker task "${input.task}"`,
    snapshot: data,
  });
  return data as AdminDefaultTrackerTask;
}

export async function updateTrackerTask(
  id: string,
  patch: Partial<Omit<AdminDefaultTrackerTask, 'id' | 'isDeleted'>>,
): Promise<AdminDefaultTrackerTask> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultTrackerTask.update({ id, ...patch });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultTrackerTask',
    recordId: id,
    summary: `Updated tracker task "${data.task}"`,
    snapshot: data,
  });
  return data as AdminDefaultTrackerTask;
}

export async function deleteTrackerTask(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultTrackerTask.update({
    id,
    isDeleted: true,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'delete failed');
  await writeAudit({
    action: 'delete',
    modelName: 'AdminDefaultTrackerTask',
    recordId: id,
    summary: `Removed tracker task "${data.task}"`,
    snapshot: data,
  });
}

// ============================================================
// Responsibilities (customer + plainid)
// ============================================================

export async function listResponsibilities(): Promise<AdminDefaultResponsibility[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultResponsibility.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return liveAndSorted<AdminDefaultResponsibility>(data ?? []);
}

// ============================================================
// Personas
// ============================================================

export async function listAdminPersonas(): Promise<AdminDefaultPersona[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultPersona.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return liveAndSorted<AdminDefaultPersona>(data ?? []);
}

// ============================================================
// Reference docs
// ============================================================

export async function listAdminReferenceDocs(): Promise<AdminDefaultReferenceDoc[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultReferenceDoc.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return liveAndSorted<AdminDefaultReferenceDoc>(data ?? []);
}

// ============================================================
// Sprints
// ============================================================

export async function listAdminSprints(): Promise<AdminDefaultSprint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultSprint.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return liveAndSorted<AdminDefaultSprint>(data ?? []);
}

// ============================================================
// Boilerplate (key/value)
// ============================================================

export async function listAdminBoilerplate(): Promise<AdminDefaultBoilerplate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultBoilerplate.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return (data ?? []).filter((r: AdminDefaultBoilerplate) => !r.isDeleted) as AdminDefaultBoilerplate[];
}

// ============================================================
// Bootstrap — seeds empty admin tables from hardcoded seed-data
//
// On first sign-in after this feature ships, the admin tables are empty.
// Without bootstrap, opening Admin → Tracker shows "No tracker defaults
// yet" (and worse, every new POC seeds from the hardcoded fallback that
// can't be edited). Bootstrap copies the hardcoded seeds into the admin
// tables so the team can edit them.
//
// Idempotent: each table is only seeded if currently empty. Bootstrap
// writes bypass the audit log (no team member made these changes; they're
// just the starting baseline).
// ============================================================

import {
  DEFAULT_TRACKER,
  DEFAULT_PERSONAS,
  DEFAULT_SPRINTS,
  DEFAULT_REFERENCE_DOCS,
} from './seed-data';

interface BootstrapResult {
  trackerSeeded: number;
  responsibilitiesSeeded: number;
  personasSeeded: number;
  referenceDocsSeeded: number;
  sprintsSeeded: number;
  boilerplateSeeded: number;
}

/**
 * Seed empty admin tables from the hardcoded seed-data constants.
 * Returns counts of rows seeded per table; zero means the table already
 * had data and was skipped (idempotency).
 *
 * The default customer/PlainID responsibilities text comes from emptyPoc()
 * defaults — we duplicate them here as constants rather than parsing
 * emptyPoc to keep this seeding deterministic and reviewable.
 */
export async function bootstrapAdminDefaults(): Promise<BootstrapResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const result: BootstrapResult = {
    trackerSeeded: 0,
    responsibilitiesSeeded: 0,
    personasSeeded: 0,
    referenceDocsSeeded: 0,
    sprintsSeeded: 0,
    boilerplateSeeded: 0,
  };

  // --- Tracker tasks ---
  try {
    const { data: existing } = await c.models.AdminDefaultTrackerTask.list();
    if ((existing ?? []).length === 0) {
      for (let i = 0; i < DEFAULT_TRACKER.length; i++) {
        const t = DEFAULT_TRACKER[i];
        try {
          await c.models.AdminDefaultTrackerTask.create({
            phase: t.phase,
            task: t.task,
            responsible: t.responsible,
            defaultStatus: t.status,
            sortOrder: (i + 1) * 10,
            isDeleted: false,
          });
          result.trackerSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap tracker seed failed for row', i, err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap tracker list failed', err);
  }

  // --- Responsibilities (customer + plainid) ---
  // These are hardcoded as multi-line strings in emptyPoc(). For the admin
  // catalog we store one row per bullet so they can be edited individually.
  const DEFAULT_CUSTOMER_RESPONSIBILITIES = [
    'Provision Kubernetes cluster (or namespace) for PlainID component deployment',
    'Provide network connectivity to data sources, identity stores, and downstream systems',
    'Identify a network/infrastructure contact for connectivity setup and troubleshooting',
    'Provision test user accounts representing each persona, with documented attribute values',
    'Provide sample JWTs / token introspection for the primary IdP',
    'Grant POC team access to the customer POC environment',
    'Review success criteria with stakeholders prior to kickoff',
  ];
  const DEFAULT_PLAINID_RESPONSIBILITIES = [
    'Provision PlainID SaaS tenant (PAP) scoped for the POC',
    'Provide Helm charts and deployment documentation for PDP/PAA components',
    'Lead authorizer configuration, integration testing, and policy authoring',
    'Deliver weekly status reports against use case success criteria',
    'Provide Solutions Engineering support throughout the engagement',
    'Document findings, gaps, and post-POC recommendations',
  ];
  try {
    const { data: existing } = await c.models.AdminDefaultResponsibility.list();
    if ((existing ?? []).length === 0) {
      let order = 0;
      for (const text of DEFAULT_CUSTOMER_RESPONSIBILITIES) {
        try {
          await c.models.AdminDefaultResponsibility.create({
            kind: 'customer',
            text,
            sortOrder: (order += 10),
            isDeleted: false,
          });
          result.responsibilitiesSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap responsibility seed failed', err);
        }
      }
      order = 0;
      for (const text of DEFAULT_PLAINID_RESPONSIBILITIES) {
        try {
          await c.models.AdminDefaultResponsibility.create({
            kind: 'plainid',
            text,
            sortOrder: (order += 10),
            isDeleted: false,
          });
          result.responsibilitiesSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap responsibility seed failed', err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap responsibilities list failed', err);
  }

  // --- Personas ---
  try {
    const { data: existing } = await c.models.AdminDefaultPersona.list();
    if ((existing ?? []).length === 0) {
      for (let i = 0; i < DEFAULT_PERSONAS.length; i++) {
        const p = DEFAULT_PERSONAS[i];
        try {
          await c.models.AdminDefaultPersona.create({
            name: p.name,
            description: p.description,
            sortOrder: (i + 1) * 10,
            isDeleted: false,
          });
          result.personasSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap persona seed failed', err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap personas list failed', err);
  }

  // --- Reference docs ---
  try {
    const { data: existing } = await c.models.AdminDefaultReferenceDoc.list();
    if ((existing ?? []).length === 0) {
      for (let i = 0; i < DEFAULT_REFERENCE_DOCS.length; i++) {
        const d = DEFAULT_REFERENCE_DOCS[i];
        try {
          await c.models.AdminDefaultReferenceDoc.create({
            title: d.title,
            url: d.url,
            description: d.description,
            sortOrder: (i + 1) * 10,
            isDeleted: false,
          });
          result.referenceDocsSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap ref doc seed failed', err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap ref docs list failed', err);
  }

  // --- Sprints ---
  // The admin schema for sprints uses a `name` field; the actual Sprint
  // type in PocDocument uses `phase`. Map phase → name on seed.
  try {
    const { data: existing } = await c.models.AdminDefaultSprint.list();
    if ((existing ?? []).length === 0) {
      for (let i = 0; i < DEFAULT_SPRINTS.length; i++) {
        const s = DEFAULT_SPRINTS[i];
        try {
          await c.models.AdminDefaultSprint.create({
            name: s.phase, // admin's "name" maps to Sprint's "phase"
            weeks: s.weeks,
            focus: s.focus,
            deliverables: '',
            sortOrder: (i + 1) * 10,
            isDeleted: false,
          });
          result.sprintsSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap sprint seed failed', err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap sprints list failed', err);
  }

  // --- Boilerplate (cadence, timeline summary) ---
  // Tenant strategy templates are not seeded yet because they take a
  // customer-name argument; they continue to render via the hardcoded
  // tenantStrategyDefault() function until the Boilerplate tab introduces
  // a template-substitution mechanism in Bundle 2.
  const DEFAULT_CADENCE =
    'Weekly syncs (PlainID SE + customer POC team) throughout the engagement. Slack / Teams channel established for async Q&A and issue tracking. Two-week use-case sprints: Identify requirements → Build → Test → Review Success Criteria → Update Status.';
  const DEFAULT_TIMELINE_SUMMARY =
    'Scoped for a minimum of 6 weeks to allow sufficient time for environment setup, use-case sprint execution, testing, and knowledge transfer. Structured as 2-week sprints aligned to use-case clusters.';

  try {
    const { data: existing } = await c.models.AdminDefaultBoilerplate.list();
    if ((existing ?? []).length === 0) {
      try {
        await c.models.AdminDefaultBoilerplate.create({
          key: 'cadence',
          label: 'Cadence & collaboration model',
          value: DEFAULT_CADENCE,
          isDeleted: false,
        });
        result.boilerplateSeeded++;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('bootstrap cadence seed failed', err);
      }
      try {
        await c.models.AdminDefaultBoilerplate.create({
          key: 'timeline.summary',
          label: 'Timeline summary',
          value: DEFAULT_TIMELINE_SUMMARY,
          isDeleted: false,
        });
        result.boilerplateSeeded++;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('bootstrap timeline seed failed', err);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap boilerplate list failed', err);
  }

  return result;
}
