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
