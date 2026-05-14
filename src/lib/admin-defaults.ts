import { client } from './client';
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import type {
  AdminDefaultTrackerTask,
  AdminDefaultResponsibility,
  AdminDefaultPersona,
  AdminDefaultReferenceDoc,
  AdminDefaultSprint,
  AdminDefaultBoilerplate,
  AdminDefaultSystemCatalogEntry,
  AdminDefaultIdentityProviderEntry,
  AdminDefaultPlainIdTeamMember,
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

/**
 * Reset the tracker default catalog to factory state by soft-deleting all
 * live rows, then running bootstrap which will re-seed from DEFAULT_TRACKER.
 * The audit log records a single high-level RESET entry rather than one
 * delete per task to keep the activity feed clean.
 */
export async function resetTrackerToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data: existing } = await c.models.AdminDefaultTrackerTask.list();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const live = ((existing ?? []) as any[]).filter((r) => !r.isDeleted);
  for (const row of live) {
    try {
      await c.models.AdminDefaultTrackerTask.update({ id: row.id, isDeleted: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('reset: failed to soft-delete row', row.id, err);
    }
  }
  // Now run the bootstrap; with no live rows it will re-seed from defaults.
  await bootstrapAdminDefaults();
  // Single audit entry summarizing the reset.
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultTrackerTask',
    recordId: 'reset',
    summary: `Reset tracker defaults — restored ${DEFAULT_TRACKER.length} factory tasks`,
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

export async function createResponsibility(
  input: Omit<AdminDefaultResponsibility, 'id' | 'isDeleted'>,
): Promise<AdminDefaultResponsibility> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultResponsibility.create({
    ...input,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultResponsibility',
    recordId: data.id,
    summary: `Added ${input.kind} responsibility "${truncate(input.text)}"`,
    snapshot: data,
  });
  return data as AdminDefaultResponsibility;
}

export async function updateResponsibility(
  id: string,
  patch: Partial<Omit<AdminDefaultResponsibility, 'id' | 'isDeleted'>>,
): Promise<AdminDefaultResponsibility> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultResponsibility.update({ id, ...patch });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultResponsibility',
    recordId: id,
    summary: `Updated ${data.kind} responsibility "${truncate(data.text)}"`,
    snapshot: data,
  });
  return data as AdminDefaultResponsibility;
}

export async function deleteResponsibility(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultResponsibility.update({
    id,
    isDeleted: true,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'delete failed');
  await writeAudit({
    action: 'delete',
    modelName: 'AdminDefaultResponsibility',
    recordId: id,
    summary: `Removed ${data.kind} responsibility "${truncate(data.text)}"`,
    snapshot: data,
  });
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

export async function createAdminPersona(
  input: Omit<AdminDefaultPersona, 'id' | 'isDeleted'>,
): Promise<AdminDefaultPersona> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultPersona.create({
    ...input,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultPersona',
    recordId: data.id,
    summary: `Added persona "${input.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultPersona;
}

export async function updateAdminPersona(
  id: string,
  patch: Partial<Omit<AdminDefaultPersona, 'id' | 'isDeleted'>>,
): Promise<AdminDefaultPersona> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultPersona.update({ id, ...patch });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultPersona',
    recordId: id,
    summary: `Updated persona "${data.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultPersona;
}

export async function deleteAdminPersona(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultPersona.update({
    id,
    isDeleted: true,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'delete failed');
  await writeAudit({
    action: 'delete',
    modelName: 'AdminDefaultPersona',
    recordId: id,
    summary: `Removed persona "${data.name}"`,
    snapshot: data,
  });
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

export async function createAdminReferenceDoc(
  input: Omit<AdminDefaultReferenceDoc, 'id' | 'isDeleted'>,
): Promise<AdminDefaultReferenceDoc> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultReferenceDoc.create({
    ...input,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultReferenceDoc',
    recordId: data.id,
    summary: `Added reference doc "${input.title}"`,
    snapshot: data,
  });
  return data as AdminDefaultReferenceDoc;
}

export async function updateAdminReferenceDoc(
  id: string,
  patch: Partial<Omit<AdminDefaultReferenceDoc, 'id' | 'isDeleted'>>,
): Promise<AdminDefaultReferenceDoc> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultReferenceDoc.update({ id, ...patch });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultReferenceDoc',
    recordId: id,
    summary: `Updated reference doc "${data.title}"`,
    snapshot: data,
  });
  return data as AdminDefaultReferenceDoc;
}

export async function deleteAdminReferenceDoc(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultReferenceDoc.update({
    id,
    isDeleted: true,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'delete failed');
  await writeAudit({
    action: 'delete',
    modelName: 'AdminDefaultReferenceDoc',
    recordId: id,
    summary: `Removed reference doc "${data.title}"`,
    snapshot: data,
  });
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

export async function createAdminSprint(
  input: Omit<AdminDefaultSprint, 'id' | 'isDeleted'>,
): Promise<AdminDefaultSprint> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultSprint.create({
    ...input,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultSprint',
    recordId: data.id,
    summary: `Added sprint "${input.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultSprint;
}

export async function updateAdminSprint(
  id: string,
  patch: Partial<Omit<AdminDefaultSprint, 'id' | 'isDeleted'>>,
): Promise<AdminDefaultSprint> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultSprint.update({ id, ...patch });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultSprint',
    recordId: id,
    summary: `Updated sprint "${data.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultSprint;
}

export async function deleteAdminSprint(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultSprint.update({
    id,
    isDeleted: true,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'delete failed');
  await writeAudit({
    action: 'delete',
    modelName: 'AdminDefaultSprint',
    recordId: id,
    summary: `Removed sprint "${data.name}"`,
    snapshot: data,
  });
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

/**
 * Upsert a boilerplate row by key. If a (non-deleted) row exists with the
 * key, its value is updated. Otherwise a new row is created. Keys come
 * from the BOILERPLATE_KEYS constant — admin UI doesn't expose new-key
 * creation, but the model supports it for future free-form expansion.
 */
export async function setBoilerplateValue(
  key: string,
  label: string,
  value: string,
): Promise<AdminDefaultBoilerplate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data: rows } = await c.models.AdminDefaultBoilerplate.list();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (rows ?? []).find(
    (r: AdminDefaultBoilerplate) => r.key === key && !r.isDeleted,
  );
  if (existing) {
    const { data, errors } = await c.models.AdminDefaultBoilerplate.update({
      id: existing.id,
      value,
      label,
    });
    if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
    await writeAudit({
      action: 'update',
      modelName: 'AdminDefaultBoilerplate',
      recordId: data.id,
      summary: `Updated boilerplate "${label}"`,
      snapshot: data,
    });
    return data as AdminDefaultBoilerplate;
  }
  const { data, errors } = await c.models.AdminDefaultBoilerplate.create({
    key,
    label,
    value,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultBoilerplate',
    recordId: data.id,
    summary: `Added boilerplate "${label}"`,
    snapshot: data,
  });
  return data as AdminDefaultBoilerplate;
}

// ============================================================
// Truncation helper for audit summaries (keeps the activity
// feed readable when an SE edits a long bullet)
// ============================================================

function truncate(s: string, n = 60): string {
  const t = (s ?? '').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
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
import { SYSTEM_CATALOG, IDENTITY_PROVIDER_CATALOG, PLAINID_TEAM_CATALOG } from '../types';

interface BootstrapResult {
  trackerSeeded: number;
  responsibilitiesSeeded: number;
  personasSeeded: number;
  referenceDocsSeeded: number;
  sprintsSeeded: number;
  boilerplateSeeded: number;
  systemCatalogSeeded: number;
  identityProvidersSeeded: number;
  plainidTeamSeeded: number;
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
    systemCatalogSeeded: 0,
    identityProvidersSeeded: 0,
    plainidTeamSeeded: 0,
  };

  // --- Tracker tasks ---
  try {
    const { data: existing } = await c.models.AdminDefaultTrackerTask.list();
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
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
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
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
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
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
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
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
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
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

  // --- Boilerplate (cadence, timeline summary, tenant strategy templates) ---
  // Tenant strategy templates use `{{customer}}` as a placeholder; the
  // resolveTenantStrategyTemplate helper substitutes the actual customer
  // name at render time. Three rows: customer / plainid / other.
  const DEFAULT_CADENCE =
    'Weekly syncs (PlainID SE + customer POC team) throughout the engagement. Slack / Teams channel established for async Q&A and issue tracking. Two-week use-case sprints: Identify requirements → Build → Test → Review Success Criteria → Update Status.';
  const DEFAULT_TIMELINE_SUMMARY =
    'Scoped for a minimum of 6 weeks to allow sufficient time for environment setup, use-case sprint execution, testing, and knowledge transfer. Structured as 2-week sprints aligned to use-case clusters.';
  const DEFAULT_TENANT_STRATEGY_CUSTOMER =
    "The POC will run in {{customer}}'s PlainID tenant. {{customer}} owns and operates the tenant; PlainID does not have direct access. Working sessions in the tenant will be driven by a {{customer}} representative, with PlainID providing real-time guidance and validation.";
  const DEFAULT_TENANT_STRATEGY_PLAINID =
    'PlainID will provision a dedicated tenant for the {{customer}} POC engagement. PlainID retains administrative access to support configuration and troubleshooting between sessions. {{customer}} will be granted appropriate roles to participate in policy authoring, testing, and review.';
  const DEFAULT_TENANT_STRATEGY_OTHER = '';

  try {
    const { data: existing } = await c.models.AdminDefaultBoilerplate.list();
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
      const rows = [
        { key: 'cadence', label: 'Cadence & collaboration model', value: DEFAULT_CADENCE },
        { key: 'timeline.summary', label: 'Timeline summary', value: DEFAULT_TIMELINE_SUMMARY },
        {
          key: 'tenantStrategy.customer',
          label: 'Tenant strategy — Customer-owned',
          value: DEFAULT_TENANT_STRATEGY_CUSTOMER,
        },
        {
          key: 'tenantStrategy.plainid',
          label: 'Tenant strategy — PlainID-owned',
          value: DEFAULT_TENANT_STRATEGY_PLAINID,
        },
        {
          key: 'tenantStrategy.other',
          label: 'Tenant strategy — Other',
          value: DEFAULT_TENANT_STRATEGY_OTHER,
        },
      ];
      for (const row of rows) {
        try {
          await c.models.AdminDefaultBoilerplate.create({
            ...row,
            isDeleted: false,
          });
          result.boilerplateSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap boilerplate seed failed for', row.key, err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap boilerplate list failed', err);
  }

  // --- System catalog ---
  try {
    const { data: existing } = await c.models.AdminDefaultSystemCatalogEntry.list();
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
      for (let i = 0; i < SYSTEM_CATALOG.length; i++) {
        const s = SYSTEM_CATALOG[i];
        try {
          await c.models.AdminDefaultSystemCatalogEntry.create({
            name: s.name,
            category: s.category,
            authorizerId: s.authorizerId,
            defaultFocus: s.defaultFocus,
            sortOrder: (i + 1) * 10,
            isDeleted: false,
          });
          result.systemCatalogSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap system catalog seed failed for', s.name, err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap system catalog list failed', err);
  }

  // --- Identity provider catalog ---
  try {
    const { data: existing } = await c.models.AdminDefaultIdentityProviderEntry.list();
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
      for (let i = 0; i < IDENTITY_PROVIDER_CATALOG.length; i++) {
        const e = IDENTITY_PROVIDER_CATALOG[i];
        try {
          await c.models.AdminDefaultIdentityProviderEntry.create({
            name: e.name,
            providerType: e.providerType,
            defaultType: e.defaultType,
            defaultNotes: e.defaultNotes,
            sortOrder: (i + 1) * 10,
            isDeleted: false,
          });
          result.identityProvidersSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap identity provider seed failed for', e.name, err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap identity provider list failed', err);
  }

  // --- PlainID team members ---
  try {
    const { data: existing } = await c.models.AdminDefaultPlainIdTeamMember.list();
    if (((existing ?? []) as Array<{ isDeleted?: boolean | null }>).filter((r) => !r.isDeleted).length === 0) {
      for (let i = 0; i < PLAINID_TEAM_CATALOG.length; i++) {
        const m = PLAINID_TEAM_CATALOG[i];
        try {
          await c.models.AdminDefaultPlainIdTeamMember.create({
            name: m.name,
            email: m.email,
            defaultRole: m.defaultRole,
            sortOrder: (i + 1) * 10,
            isDeleted: false,
          });
          result.plainidTeamSeeded++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('bootstrap plainid team seed failed for', m.name, err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('bootstrap plainid team list failed', err);
  }

  return result;
}

// ============================================================
// Reset-to-factory helpers — same pattern as resetTrackerToDefaults.
// Each soft-deletes all live rows in its category, then re-runs the
// bootstrap (which sees an empty live set and re-seeds from
// hardcoded defaults). One summary audit entry per reset.
// ============================================================

async function softDeleteAllLive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collection: any,
): Promise<number> {
  const { data: existing } = await collection.list();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const live = ((existing ?? []) as any[]).filter((r) => !r.isDeleted);
  for (const row of live) {
    try {
      await collection.update({ id: row.id, isDeleted: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('reset: failed to soft-delete row', row.id, err);
    }
  }
  return live.length;
}

export async function resetResponsibilitiesToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const removed = await softDeleteAllLive(c.models.AdminDefaultResponsibility);
  await bootstrapAdminDefaults();
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultResponsibility',
    recordId: 'reset',
    summary: `Reset responsibility defaults — replaced ${removed} row${removed === 1 ? '' : 's'}`,
  });
}

export async function resetPersonasToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const removed = await softDeleteAllLive(c.models.AdminDefaultPersona);
  await bootstrapAdminDefaults();
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultPersona',
    recordId: 'reset',
    summary: `Reset persona defaults — replaced ${removed} row${removed === 1 ? '' : 's'}`,
  });
}

export async function resetReferenceDocsToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const removed = await softDeleteAllLive(c.models.AdminDefaultReferenceDoc);
  await bootstrapAdminDefaults();
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultReferenceDoc',
    recordId: 'reset',
    summary: `Reset reference doc defaults — replaced ${removed} row${removed === 1 ? '' : 's'}`,
  });
}

export async function resetSprintsToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const removed = await softDeleteAllLive(c.models.AdminDefaultSprint);
  await bootstrapAdminDefaults();
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultSprint',
    recordId: 'reset',
    summary: `Reset sprint defaults — replaced ${removed} row${removed === 1 ? '' : 's'}`,
  });
}

export async function resetBoilerplateToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const removed = await softDeleteAllLive(c.models.AdminDefaultBoilerplate);
  await bootstrapAdminDefaults();
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultBoilerplate',
    recordId: 'reset',
    summary: `Reset boilerplate defaults — replaced ${removed} row${removed === 1 ? '' : 's'}`,
  });
}

/**
 * Look up a boilerplate template by key and substitute {{customer}} with
 * the supplied customer name. Falls back to the hardcoded value when the
 * admin row is missing (e.g. before bootstrap has run).
 */
export function resolveTenantStrategyTemplate(
  boilerplate: AdminDefaultBoilerplate[],
  choice: 'customer' | 'plainid' | 'other' | '',
  customerName: string,
): string {
  if (!choice) return '';
  const key = `tenantStrategy.${choice}`;
  const row = boilerplate.find((r) => r.key === key);
  const tpl = row?.value ?? '';
  const customer = customerName.trim() || 'the customer';
  return tpl.replace(/\{\{customer\}\}/g, customer);
}

// ============================================================
// System catalog
// ============================================================

export async function listAdminSystemCatalog(): Promise<AdminDefaultSystemCatalogEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultSystemCatalogEntry.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return liveAndSorted<AdminDefaultSystemCatalogEntry>(data ?? []);
}

export async function createAdminSystemCatalogEntry(
  input: Omit<AdminDefaultSystemCatalogEntry, 'id' | 'isDeleted'>,
): Promise<AdminDefaultSystemCatalogEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultSystemCatalogEntry.create({
    ...input,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultSystemCatalogEntry',
    recordId: data.id,
    summary: `Added system "${input.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultSystemCatalogEntry;
}

export async function updateAdminSystemCatalogEntry(
  id: string,
  patch: Partial<Omit<AdminDefaultSystemCatalogEntry, 'id' | 'isDeleted'>>,
): Promise<AdminDefaultSystemCatalogEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultSystemCatalogEntry.update({ id, ...patch });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultSystemCatalogEntry',
    recordId: id,
    summary: `Updated system "${data.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultSystemCatalogEntry;
}

export async function deleteAdminSystemCatalogEntry(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultSystemCatalogEntry.update({
    id,
    isDeleted: true,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'delete failed');
  await writeAudit({
    action: 'delete',
    modelName: 'AdminDefaultSystemCatalogEntry',
    recordId: id,
    summary: `Removed system "${data.name}"`,
    snapshot: data,
  });
}

export async function resetSystemCatalogToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const removed = await softDeleteAllLive(c.models.AdminDefaultSystemCatalogEntry);
  await bootstrapAdminDefaults();
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultSystemCatalogEntry',
    recordId: 'reset',
    summary: `Reset system catalog defaults — replaced ${removed} row${removed === 1 ? '' : 's'}`,
  });
}

// ============================================================
// Identity provider catalog
// ============================================================

export async function listAdminIdentityProviders(): Promise<AdminDefaultIdentityProviderEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultIdentityProviderEntry.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return liveAndSorted<AdminDefaultIdentityProviderEntry>(data ?? []);
}

export async function createAdminIdentityProvider(
  input: Omit<AdminDefaultIdentityProviderEntry, 'id' | 'isDeleted'>,
): Promise<AdminDefaultIdentityProviderEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultIdentityProviderEntry.create({
    ...input,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultIdentityProviderEntry',
    recordId: data.id,
    summary: `Added identity provider "${input.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultIdentityProviderEntry;
}

export async function updateAdminIdentityProvider(
  id: string,
  patch: Partial<Omit<AdminDefaultIdentityProviderEntry, 'id' | 'isDeleted'>>,
): Promise<AdminDefaultIdentityProviderEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultIdentityProviderEntry.update({ id, ...patch });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultIdentityProviderEntry',
    recordId: id,
    summary: `Updated identity provider "${data.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultIdentityProviderEntry;
}

export async function deleteAdminIdentityProvider(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultIdentityProviderEntry.update({
    id,
    isDeleted: true,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'delete failed');
  await writeAudit({
    action: 'delete',
    modelName: 'AdminDefaultIdentityProviderEntry',
    recordId: id,
    summary: `Removed identity provider "${data.name}"`,
    snapshot: data,
  });
}

export async function resetIdentityProvidersToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const removed = await softDeleteAllLive(c.models.AdminDefaultIdentityProviderEntry);
  await bootstrapAdminDefaults();
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultIdentityProviderEntry',
    recordId: 'reset',
    summary: `Reset identity provider defaults — replaced ${removed} row${removed === 1 ? '' : 's'}`,
  });
}

// ============================================================
// PlainID team members
// ============================================================

export async function listAdminPlainIdTeam(): Promise<AdminDefaultPlainIdTeamMember[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultPlainIdTeamMember.list();
  if (errors?.length) throw new Error(errors[0]?.message ?? 'list failed');
  return liveAndSorted<AdminDefaultPlainIdTeamMember>(data ?? []);
}

export async function createAdminPlainIdTeamMember(
  input: Omit<AdminDefaultPlainIdTeamMember, 'id' | 'isDeleted'>,
): Promise<AdminDefaultPlainIdTeamMember> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultPlainIdTeamMember.create({
    ...input,
    isDeleted: false,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'create failed');
  await writeAudit({
    action: 'create',
    modelName: 'AdminDefaultPlainIdTeamMember',
    recordId: data.id,
    summary: `Added PlainID team member "${input.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultPlainIdTeamMember;
}

export async function updateAdminPlainIdTeamMember(
  id: string,
  patch: Partial<Omit<AdminDefaultPlainIdTeamMember, 'id' | 'isDeleted'>>,
): Promise<AdminDefaultPlainIdTeamMember> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultPlainIdTeamMember.update({ id, ...patch });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'update failed');
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultPlainIdTeamMember',
    recordId: id,
    summary: `Updated PlainID team member "${data.name}"`,
    snapshot: data,
  });
  return data as AdminDefaultPlainIdTeamMember;
}

export async function deleteAdminPlainIdTeamMember(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const { data, errors } = await c.models.AdminDefaultPlainIdTeamMember.update({
    id,
    isDeleted: true,
  });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'delete failed');
  await writeAudit({
    action: 'delete',
    modelName: 'AdminDefaultPlainIdTeamMember',
    recordId: id,
    summary: `Removed PlainID team member "${data.name}"`,
    snapshot: data,
  });
}

export async function resetPlainIdTeamToDefaults(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = client;
  const removed = await softDeleteAllLive(c.models.AdminDefaultPlainIdTeamMember);
  await bootstrapAdminDefaults();
  await writeAudit({
    action: 'update',
    modelName: 'AdminDefaultPlainIdTeamMember',
    recordId: 'reset',
    summary: `Reset PlainID team defaults — replaced ${removed} row${removed === 1 ? '' : 's'}`,
  });
}
