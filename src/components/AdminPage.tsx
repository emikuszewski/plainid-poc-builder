import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Pill, Modal, Field } from './ui/Primitives';
import { useDefaults } from '../lib/defaults-context';
import {
  createTrackerTask,
  updateTrackerTask,
  deleteTrackerTask,
  resetTrackerToDefaults,
  createResponsibility,
  updateResponsibility,
  deleteResponsibility,
  resetResponsibilitiesToDefaults,
  createAdminPersona,
  updateAdminPersona,
  deleteAdminPersona,
  resetPersonasToDefaults,
  createAdminReferenceDoc,
  updateAdminReferenceDoc,
  deleteAdminReferenceDoc,
  resetReferenceDocsToDefaults,
  createAdminSprint,
  updateAdminSprint,
  deleteAdminSprint,
  resetSprintsToDefaults,
  setBoilerplateValue,
  resetBoilerplateToDefaults,
  createAdminSystemCatalogEntry,
  updateAdminSystemCatalogEntry,
  deleteAdminSystemCatalogEntry,
  resetSystemCatalogToDefaults,
  createAdminIdentityProvider,
  updateAdminIdentityProvider,
  deleteAdminIdentityProvider,
  resetIdentityProvidersToDefaults,
  listAuditLog,
} from '../lib/admin-defaults';
import type {
  AdminDefaultTrackerTask,
  AdminDefaultResponsibility,
  AdminDefaultPersona,
  AdminDefaultReferenceDoc,
  AdminDefaultSprint,
  AdminDefaultBoilerplate,
  AdminDefaultSystemCatalogEntry,
  AdminDefaultIdentityProviderEntry,
  AdminAuditLogEntry,
} from '../types';

/**
 * Admin page — shared catalogs the team curates together.
 *
 * Tabs:
 *   - Activity (default)   → audit log of all admin changes
 *   - Tracker              → default tracker tasks seeded into every new POC
 *   - Responsibilities     → default customer + plainid bullet lists (placeholder)
 *   - Personas             → default test personas (placeholder)
 *   - Reference Docs       → default reference docs (placeholder)
 *   - Sprints              → default sprint structure (placeholder)
 *   - Boilerplate          → free-form copy (cadence, tenant strategy) (placeholder)
 *
 * Bundle 1 ships Activity + Tracker fully functional; the others render a
 * "Coming soon" placeholder so the layout is final but the work is staged.
 */

const TABS = [
  { id: 'activity', label: 'Activity', shortLabel: 'ACT' },
  { id: 'tracker', label: 'Tracker', shortLabel: 'TRK' },
  { id: 'responsibilities', label: 'Responsibilities', shortLabel: 'RSP' },
  { id: 'personas', label: 'Personas', shortLabel: 'PER' },
  { id: 'docs', label: 'Reference Docs', shortLabel: 'DOC' },
  { id: 'sprints', label: 'Sprints', shortLabel: 'SPR' },
  { id: 'systems', label: 'In-scope Systems', shortLabel: 'SYS' },
  { id: 'idps', label: 'Identity Providers', shortLabel: 'IDP' },
  { id: 'boilerplate', label: 'Boilerplate', shortLabel: 'COP' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function AdminPage() {
  const { tab: routeTab } = useParams<{ tab: string }>();
  const nav = useNavigate();
  const activeTab: TabId = (TABS.find((t) => t.id === routeTab)?.id ?? 'activity') as TabId;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Admin</h1>
        <p className="text-[12.5px] text-[var(--color-text-muted)] mt-1 max-w-2xl leading-relaxed">
          Defaults the team curates together. New POCs seed from these catalogs.
          Changes here don't retroactively update existing POCs — they only
          affect POCs created from this point forward.
        </p>
      </header>

      <nav className="border-b border-[var(--color-border)] mb-6 -mx-1 flex flex-wrap">
        {TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => nav(`/admin/${t.id}`)}
              className={`px-3 py-2 text-[12.5px] border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-[var(--color-accent)] text-[var(--color-text)] font-medium'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'activity' && <ActivityTab />}
      {activeTab === 'tracker' && <TrackerTab />}
      {activeTab === 'responsibilities' && <ResponsibilitiesTab />}
      {activeTab === 'personas' && <PersonasTab />}
      {activeTab === 'docs' && <ReferenceDocsTab />}
      {activeTab === 'sprints' && <SprintsTab />}
      {activeTab === 'systems' && <SystemCatalogTab />}
      {activeTab === 'idps' && <IdentityProvidersTab />}
      {activeTab === 'boilerplate' && <BoilerplateTab />}
    </div>
  );
}

// ============================================================
// Activity tab — read-only audit log
// ============================================================

function ActivityTab() {
  const [entries, setEntries] = useState<AdminAuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const rows = await listAuditLog(100);
      setEntries(rows);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load activity');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (entries === null && !error) {
    return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading activity…</div>;
  }
  if (error) {
    return (
      <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
        {error}
      </div>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-lg px-6 py-12 text-center">
        <div className="text-[13px] font-medium">No activity yet</div>
        <div className="text-[12px] text-[var(--color-text-muted)] mt-1">
          Changes to admin defaults will show up here.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-3 px-3 py-2 border border-[var(--color-border)] rounded-md bg-[var(--color-bg-elevated)]"
        >
          <Pill tone={e.action === 'delete' ? 'danger' : e.action === 'create' ? 'accent' : 'neutral'}>
            {e.action.toUpperCase()}
          </Pill>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] truncate">{e.summary}</div>
            <div className="text-[10.5px] mono text-[var(--color-text-dim)] tracking-wider mt-0.5">
              {e.userEmail} · {formatRelative(e.timestamp)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 30) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============================================================
// Tracker tab — edit default tracker tasks
// ============================================================

function TrackerTab() {
  const { tracker, refresh, loaded } = useDefaults();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Group tasks by phase so the SE can see the structure clearly.
  const byPhase = useMemo(() => {
    const m = new Map<string, AdminDefaultTrackerTask[]>();
    for (const t of tracker) {
      const arr = m.get(t.phase) ?? [];
      arr.push(t);
      m.set(t.phase, arr);
    }
    return m;
  }, [tracker]);

  const handleCreate = async (phase: string) => {
    setBusy(true);
    setError(null);
    try {
      // Place the new row at the end of its phase, using max sortOrder + 10.
      const maxOrder = tracker.length
        ? Math.max(...tracker.map((t) => t.sortOrder ?? 0))
        : 0;
      const created = await createTrackerTask({
        phase,
        task: 'New task',
        responsible: '',
        defaultStatus: 'Not Started',
        sortOrder: maxOrder + 10,
      });
      await refresh('tracker');
      setEditingId(created.id);
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (
    id: string,
    patch: Partial<Omit<AdminDefaultTrackerTask, 'id' | 'isDeleted'>>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await updateTrackerTask(id, patch);
      await refresh('tracker');
    } catch (err: any) {
      setError(err?.message ?? 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, taskName: string) => {
    if (!confirm(`Remove "${taskName}" from tracker defaults?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTrackerTask(id);
      await refresh('tracker');
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading…</div>;
  }

  // Build a "phases in display order" array. If any phase is missing
  // from the data, the UI doesn't show it. The user can add a new
  // phase by creating a task and entering a new phase name.
  const phases = Array.from(byPhase.keys());

  const handleReset = async () => {
    if (
      !confirm(
        'Reset the tracker defaults to the built-in factory list?\n\n' +
          'All current tracker tasks will be soft-deleted and the catalog ' +
          'will be restored from the original seed data. Existing POCs ' +
          'are not affected — only new POCs created after this point ' +
          'will see the restored defaults.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetTrackerToDefaults();
      await refresh('tracker');
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed flex-1">
          {tracker.length} task{tracker.length === 1 ? '' : 's'} across {phases.length} phase
          {phases.length === 1 ? '' : 's'}. Status starts at "Not Started" by default; SEs
          update task status on each POC's Tracker section as work progresses.
        </div>
        <Button size="sm" variant="ghost" onClick={() => void handleReset()} disabled={busy}>
          Reset to factory defaults
        </Button>
      </div>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {phases.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-lg px-6 py-10 text-center">
          <div className="text-[13px] font-medium">No tracker defaults yet</div>
          <div className="text-[12px] text-[var(--color-text-muted)] mt-1 mb-4">
            New POCs are currently seeded from a built-in fallback list. Add tasks below
            to replace the fallback with your team's curated defaults.
          </div>
          <Button onClick={() => void handleCreate('Kickoff & Planning')} disabled={busy}>
            + Add first task
          </Button>
        </div>
      )}

      {phases.map((phase) => {
        const rows = byPhase.get(phase) ?? [];
        return (
          <section key={phase} className="border border-[var(--color-border)] rounded-lg overflow-hidden">
            <header className="flex items-center px-4 py-2 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]">
              <span className="text-[13px] font-medium">{phase}</span>
              <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] ml-2">
                {rows.length} TASK{rows.length === 1 ? '' : 'S'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleCreate(phase)}
                disabled={busy}
                className="ml-auto"
              >
                + Task
              </Button>
            </header>
            <div className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <TrackerRow
                  key={row.id}
                  row={row}
                  editing={editingId === row.id}
                  busy={busy}
                  onStartEdit={() => setEditingId(row.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={async (patch) => {
                    await handleUpdate(row.id, patch);
                    setEditingId(null);
                  }}
                  onDelete={() => void handleDelete(row.id, row.task)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {phases.length > 0 && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const phase = prompt('New phase name:');
              if (phase && phase.trim()) void handleCreate(phase.trim());
            }}
            disabled={busy}
          >
            + Add new phase
          </Button>
        </div>
      )}
    </div>
  );
}

function TrackerRow({
  row,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  row: AdminDefaultTrackerTask;
  editing: boolean;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<Omit<AdminDefaultTrackerTask, 'id' | 'isDeleted'>>) => Promise<void>;
  onDelete: () => void;
}) {
  const [task, setTask] = useState(row.task);
  const [responsible, setResponsible] = useState(row.responsible ?? '');
  const [defaultStatus, setDefaultStatus] = useState(row.defaultStatus ?? 'Not Started');
  const [phase, setPhase] = useState(row.phase);

  // Reset local state if row props change (e.g. after refresh) and we're not editing.
  useEffect(() => {
    if (!editing) {
      setTask(row.task);
      setResponsible(row.responsible ?? '');
      setDefaultStatus(row.defaultStatus ?? 'Not Started');
      setPhase(row.phase);
    }
  }, [row, editing]);

  if (editing) {
    return (
      <div className="px-4 py-3 bg-[var(--color-bg)]">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Task</label>
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              autoFocus
              placeholder="Task description"
            />
          </div>
          <div className="col-span-4">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Phase</label>
            <input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="Phase" />
          </div>
          <div className="col-span-4">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Responsible</label>
            <input
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="e.g. Customer + PlainID"
            />
          </div>
          <div className="col-span-4">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Default status</label>
            <select value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)}>
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              void onSave({
                task: task.trim(),
                phase: phase.trim(),
                responsible: responsible.trim(),
                defaultStatus,
              })
            }
            disabled={busy || !task.trim() || !phase.trim()}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-[var(--color-danger)]"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--color-bg-hover)] cursor-pointer"
      onClick={onStartEdit}
      role="button"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] truncate">{row.task}</div>
      </div>
      {row.responsible && (
        <span className="text-[11px] text-[var(--color-text-muted)] truncate max-w-[180px]">
          {row.responsible}
        </span>
      )}
      <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] w-24 text-right">
        {(row.defaultStatus ?? 'Not Started').toUpperCase()}
      </span>
    </div>
  );
}

// ============================================================
// Responsibilities tab — edit customer + plainid bullet lists
// ============================================================

function ResponsibilitiesTab() {
  const { responsibilities, refresh, loaded } = useDefaults();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customers = responsibilities.filter((r) => r.kind === 'customer');
  const plainids = responsibilities.filter((r) => r.kind === 'plainid');

  const handleCreate = async (kind: 'customer' | 'plainid') => {
    setBusy(true);
    setError(null);
    try {
      const rowsOfKind = responsibilities.filter((r) => r.kind === kind);
      const maxOrder = rowsOfKind.length
        ? Math.max(...rowsOfKind.map((r) => r.sortOrder ?? 0))
        : 0;
      const created = await createResponsibility({
        kind,
        text: 'New responsibility',
        sortOrder: maxOrder + 10,
      });
      await refresh('responsibilities');
      setEditingId(created.id);
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (
    id: string,
    patch: Partial<Omit<AdminDefaultResponsibility, 'id' | 'isDeleted'>>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await updateResponsibility(id, patch);
      await refresh('responsibilities');
    } catch (err: any) {
      setError(err?.message ?? 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, text: string) => {
    if (!confirm(`Remove "${text}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteResponsibility(id);
      await refresh('responsibilities');
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        'Reset responsibility defaults to the factory list?\n\n' +
          'All current rows will be soft-deleted and replaced with the ' +
          'original seed values. Existing POCs are unaffected.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetResponsibilitiesToDefaults();
      await refresh('responsibilities');
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed flex-1">
          {customers.length} customer row{customers.length === 1 ? '' : 's'},{' '}
          {plainids.length} PlainID row{plainids.length === 1 ? '' : 's'}. New POCs seed each
          side as a newline-joined bullet list.
        </div>
        <Button size="sm" variant="ghost" onClick={() => void handleReset()} disabled={busy}>
          Reset to factory defaults
        </Button>
      </div>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {(['customer', 'plainid'] as const).map((kind) => {
        const rows = kind === 'customer' ? customers : plainids;
        return (
          <section key={kind} className="border border-[var(--color-border)] rounded-lg overflow-hidden">
            <header className="flex items-center px-4 py-2 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]">
              <span className="text-[13px] font-medium">
                {kind === 'customer' ? 'Customer responsibilities' : 'PlainID responsibilities'}
              </span>
              <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] ml-2">
                {rows.length} ROW{rows.length === 1 ? '' : 'S'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleCreate(kind)}
                disabled={busy}
                className="ml-auto"
              >
                + Row
              </Button>
            </header>
            <div className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <ResponsibilityRow
                  key={row.id}
                  row={row}
                  editing={editingId === row.id}
                  busy={busy}
                  onStartEdit={() => setEditingId(row.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={async (patch) => {
                    await handleUpdate(row.id, patch);
                    setEditingId(null);
                  }}
                  onDelete={() => void handleDelete(row.id, row.text)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ResponsibilityRow({
  row,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  row: AdminDefaultResponsibility;
  editing: boolean;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<Omit<AdminDefaultResponsibility, 'id' | 'isDeleted'>>) => Promise<void>;
  onDelete: () => void;
}) {
  const [text, setText] = useState(row.text);
  useEffect(() => {
    if (!editing) setText(row.text);
  }, [row, editing]);

  if (editing) {
    return (
      <div className="px-4 py-3 bg-[var(--color-bg)]">
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder="Responsibility text"
        />
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() => void onSave({ text: text.trim() })}
            disabled={busy || !text.trim()}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-[var(--color-danger)]"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="px-4 py-2 hover:bg-[var(--color-bg-hover)] cursor-pointer text-[12.5px] leading-relaxed"
      onClick={onStartEdit}
      role="button"
    >
      {row.text}
    </div>
  );
}

// ============================================================
// Personas tab
// ============================================================

function PersonasTab() {
  const { personas, refresh, loaded } = useDefaults();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const maxOrder = personas.length ? Math.max(...personas.map((p) => p.sortOrder ?? 0)) : 0;
      const created = await createAdminPersona({
        name: 'New persona',
        description: '',
        sortOrder: maxOrder + 10,
      });
      await refresh('personas');
      setEditingId(created.id);
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (
    id: string,
    patch: Partial<Omit<AdminDefaultPersona, 'id' | 'isDeleted'>>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await updateAdminPersona(id, patch);
      await refresh('personas');
    } catch (err: any) {
      setError(err?.message ?? 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove persona "${name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminPersona(id);
      await refresh('personas');
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset persona defaults to the factory list?')) return;
    setBusy(true);
    setError(null);
    try {
      await resetPersonasToDefaults();
      await refresh('personas');
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed flex-1">
          {personas.length} persona{personas.length === 1 ? '' : 's'}. SEs typically map each to a
          concrete user / role / attribute set on a per-POC basis.
        </div>
        <Button size="sm" onClick={() => void handleCreate()} disabled={busy}>
          + Persona
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void handleReset()} disabled={busy}>
          Reset to factory defaults
        </Button>
      </div>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden divide-y divide-[var(--color-border)]">
        {personas.map((row) => (
          <PersonaRow
            key={row.id}
            row={row}
            editing={editingId === row.id}
            busy={busy}
            onStartEdit={() => setEditingId(row.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={async (patch) => {
              await handleUpdate(row.id, patch);
              setEditingId(null);
            }}
            onDelete={() => void handleDelete(row.id, row.name)}
          />
        ))}
      </div>
    </div>
  );
}

function PersonaRow({
  row,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  row: AdminDefaultPersona;
  editing: boolean;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<Omit<AdminDefaultPersona, 'id' | 'isDeleted'>>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? '');
  useEffect(() => {
    if (!editing) {
      setName(row.name);
      setDescription(row.description ?? '');
    }
  }, [row, editing]);

  if (editing) {
    return (
      <div className="px-4 py-3 bg-[var(--color-bg)]">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-4">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="col-span-8">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() => void onSave({ name: name.trim(), description: description.trim() })}
            disabled={busy || !name.trim()}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-[var(--color-danger)]"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline gap-3 px-4 py-2 hover:bg-[var(--color-bg-hover)] cursor-pointer"
      onClick={onStartEdit}
      role="button"
    >
      <span className="text-[12.5px] font-medium">{row.name}</span>
      {row.description && (
        <span className="text-[11.5px] text-[var(--color-text-muted)] truncate">
          — {row.description}
        </span>
      )}
    </div>
  );
}

// ============================================================
// Reference Docs tab
// ============================================================

function ReferenceDocsTab() {
  const { referenceDocs, refresh, loaded } = useDefaults();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const maxOrder = referenceDocs.length
        ? Math.max(...referenceDocs.map((d) => d.sortOrder ?? 0))
        : 0;
      const created = await createAdminReferenceDoc({
        title: 'New reference doc',
        url: 'https://',
        description: '',
        sortOrder: maxOrder + 10,
      });
      await refresh('referenceDocs');
      setEditingId(created.id);
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (
    id: string,
    patch: Partial<Omit<AdminDefaultReferenceDoc, 'id' | 'isDeleted'>>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await updateAdminReferenceDoc(id, patch);
      await refresh('referenceDocs');
    } catch (err: any) {
      setError(err?.message ?? 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Remove "${title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminReferenceDoc(id);
      await refresh('referenceDocs');
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset reference doc defaults to the factory list?')) return;
    setBusy(true);
    setError(null);
    try {
      await resetReferenceDocsToDefaults();
      await refresh('referenceDocs');
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed flex-1">
          {referenceDocs.length} doc{referenceDocs.length === 1 ? '' : 's'}. Public PlainID docs
          to share with the customer; SEs add or remove on a per-POC basis.
        </div>
        <Button size="sm" onClick={() => void handleCreate()} disabled={busy}>
          + Doc
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void handleReset()} disabled={busy}>
          Reset to factory defaults
        </Button>
      </div>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden divide-y divide-[var(--color-border)]">
        {referenceDocs.map((row) => (
          <ReferenceDocRow
            key={row.id}
            row={row}
            editing={editingId === row.id}
            busy={busy}
            onStartEdit={() => setEditingId(row.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={async (patch) => {
              await handleUpdate(row.id, patch);
              setEditingId(null);
            }}
            onDelete={() => void handleDelete(row.id, row.title)}
          />
        ))}
      </div>
    </div>
  );
}

function ReferenceDocRow({
  row,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  row: AdminDefaultReferenceDoc;
  editing: boolean;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<Omit<AdminDefaultReferenceDoc, 'id' | 'isDeleted'>>) => Promise<void>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [url, setUrl] = useState(row.url);
  const [description, setDescription] = useState(row.description ?? '');
  useEffect(() => {
    if (!editing) {
      setTitle(row.title);
      setUrl(row.url);
      setDescription(row.description ?? '');
    }
  }, [row, editing]);

  if (editing) {
    return (
      <div className="px-4 py-3 bg-[var(--color-bg)]">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="col-span-12">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </div>
          <div className="col-span-12">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              void onSave({
                title: title.trim(),
                url: url.trim(),
                description: description.trim(),
              })
            }
            disabled={busy || !title.trim() || !url.trim()}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-[var(--color-danger)]"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col px-4 py-2 hover:bg-[var(--color-bg-hover)] cursor-pointer"
      onClick={onStartEdit}
      role="button"
    >
      <div className="text-[12.5px] font-medium">{row.title}</div>
      <div className="text-[11px] mono text-[var(--color-text-dim)] truncate">{row.url}</div>
      {row.description && (
        <div className="text-[11.5px] text-[var(--color-text-muted)] truncate">
          {row.description}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sprints tab
// ============================================================

function SprintsTab() {
  const { sprints, refresh, loaded } = useDefaults();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const maxOrder = sprints.length ? Math.max(...sprints.map((s) => s.sortOrder ?? 0)) : 0;
      const created = await createAdminSprint({
        name: `Sprint ${sprints.length}`,
        weeks: '',
        focus: '',
        deliverables: '',
        sortOrder: maxOrder + 10,
      });
      await refresh('sprints');
      setEditingId(created.id);
    } catch (err: any) {
      setError(err?.message ?? 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (
    id: string,
    patch: Partial<Omit<AdminDefaultSprint, 'id' | 'isDeleted'>>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await updateAdminSprint(id, patch);
      await refresh('sprints');
    } catch (err: any) {
      setError(err?.message ?? 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove sprint "${name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminSprint(id);
      await refresh('sprints');
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset sprint defaults to the factory list?')) return;
    setBusy(true);
    setError(null);
    try {
      await resetSprintsToDefaults();
      await refresh('sprints');
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed flex-1">
          {sprints.length} sprint{sprints.length === 1 ? '' : 's'}. The Timeline section of each
          POC reads from these. `deliverables` is captured but not yet projected onto the
          per-POC Sprint shape — wiring lands in a future update.
        </div>
        <Button size="sm" onClick={() => void handleCreate()} disabled={busy}>
          + Sprint
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void handleReset()} disabled={busy}>
          Reset to factory defaults
        </Button>
      </div>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden divide-y divide-[var(--color-border)]">
        {sprints.map((row) => (
          <SprintRow
            key={row.id}
            row={row}
            editing={editingId === row.id}
            busy={busy}
            onStartEdit={() => setEditingId(row.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={async (patch) => {
              await handleUpdate(row.id, patch);
              setEditingId(null);
            }}
            onDelete={() => void handleDelete(row.id, row.name)}
          />
        ))}
      </div>
    </div>
  );
}

function SprintRow({
  row,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  row: AdminDefaultSprint;
  editing: boolean;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<Omit<AdminDefaultSprint, 'id' | 'isDeleted'>>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [weeks, setWeeks] = useState(row.weeks ?? '');
  const [focus, setFocus] = useState(row.focus ?? '');
  const [deliverables, setDeliverables] = useState(row.deliverables ?? '');
  useEffect(() => {
    if (!editing) {
      setName(row.name);
      setWeeks(row.weeks ?? '');
      setFocus(row.focus ?? '');
      setDeliverables(row.deliverables ?? '');
    }
  }, [row, editing]);

  if (editing) {
    return (
      <div className="px-4 py-3 bg-[var(--color-bg)]">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-6">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="col-span-6">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Weeks</label>
            <input value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="e.g. Weeks 1-2" />
          </div>
          <div className="col-span-12">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Focus</label>
            <input value={focus} onChange={(e) => setFocus(e.target.value)} />
          </div>
          <div className="col-span-12">
            <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
              Deliverables (one per line)
            </label>
            <textarea
              rows={3}
              value={deliverables}
              onChange={(e) => setDeliverables(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              void onSave({
                name: name.trim(),
                weeks: weeks.trim(),
                focus: focus.trim(),
                deliverables: deliverables.trim(),
              })
            }
            disabled={busy || !name.trim()}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-[var(--color-danger)]"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col px-4 py-2 hover:bg-[var(--color-bg-hover)] cursor-pointer"
      onClick={onStartEdit}
      role="button"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[12.5px] font-medium">{row.name}</span>
        {row.weeks && (
          <span className="mono text-[10.5px] tracking-wider text-[var(--color-text-dim)]">
            {row.weeks}
          </span>
        )}
      </div>
      {row.focus && (
        <span className="text-[11.5px] text-[var(--color-text-muted)] truncate">{row.focus}</span>
      )}
    </div>
  );
}

// ============================================================
// Boilerplate tab — edit known keys (cadence, timeline summary,
// tenant strategy templates). UI is a per-key card with a textarea.
// ============================================================

const KNOWN_BOILERPLATE_KEYS: { key: string; label: string; hint?: string; rows?: number }[] = [
  {
    key: 'cadence',
    label: 'Cadence & collaboration model',
    hint: 'Default text for the Framework section\'s cadence field.',
    rows: 4,
  },
  {
    key: 'timeline.summary',
    label: 'Timeline summary',
    hint: 'Default text for the Timeline section\'s summary field.',
    rows: 3,
  },
  {
    key: 'tenantStrategy.customer',
    label: 'Tenant strategy — Customer-owned',
    hint: 'Inserted into Discovery when the SE picks "Customer-owned". Use {{customer}} as a placeholder for the customer name.',
    rows: 5,
  },
  {
    key: 'tenantStrategy.plainid',
    label: 'Tenant strategy — PlainID-owned',
    hint: 'Inserted into Discovery when the SE picks "PlainID-owned". Use {{customer}} as a placeholder for the customer name.',
    rows: 5,
  },
  {
    key: 'tenantStrategy.other',
    label: 'Tenant strategy — Other',
    hint: 'Inserted into Discovery when the SE picks "Other". Typically blank — the SE writes a custom paragraph.',
    rows: 3,
  },
];

function BoilerplateTab() {
  const { boilerplate, refresh, loaded } = useDefaults();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async (key: string, label: string, value: string) => {
    setBusy(true);
    setError(null);
    try {
      await setBoilerplateValue(key, label, value);
      await refresh('boilerplate');
    } catch (err: any) {
      setError(err?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all boilerplate templates to factory defaults?')) return;
    setBusy(true);
    setError(null);
    try {
      await resetBoilerplateToDefaults();
      await refresh('boilerplate');
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading…</div>;

  const byKey = new Map<string, AdminDefaultBoilerplate>();
  for (const r of boilerplate) byKey.set(r.key, r);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed flex-1">
          {KNOWN_BOILERPLATE_KEYS.length} known templates. Edit a value, click Save. Tenant
          strategy templates support a <code className="mono text-[11px]">{'{{customer}}'}</code> placeholder that
          substitutes the POC's customer name at render time.
        </div>
        <Button size="sm" variant="ghost" onClick={() => void handleReset()} disabled={busy}>
          Reset to factory defaults
        </Button>
      </div>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {KNOWN_BOILERPLATE_KEYS.map((entry) => {
          const row = byKey.get(entry.key);
          return (
            <BoilerplateEditor
              key={entry.key}
              label={entry.label}
              hint={entry.hint}
              rows={entry.rows ?? 4}
              initialValue={row?.value ?? ''}
              busy={busy}
              onSave={(v) => handleSave(entry.key, entry.label, v)}
            />
          );
        })}
      </div>
    </div>
  );
}

function BoilerplateEditor({
  label,
  hint,
  rows,
  initialValue,
  busy,
  onSave,
}: {
  label: string;
  hint?: string;
  rows: number;
  initialValue: string;
  busy: boolean;
  onSave: (value: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  useEffect(() => {
    setValue(initialValue);
    setSavedValue(initialValue);
  }, [initialValue]);
  const dirty = value !== savedValue;

  return (
    <section className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <header className="px-4 py-2 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]">
        <div className="text-[12.5px] font-medium">{label}</div>
        {hint && <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{hint}</div>}
      </header>
      <div className="px-4 py-3 bg-[var(--color-bg)]">
        <textarea rows={rows} value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              await onSave(value);
              setSavedValue(value);
            }}
            disabled={busy || !dirty}
          >
            Save
          </Button>
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setValue(savedValue)}
              disabled={busy}
            >
              Discard
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// In-scope Systems tab — card grid grouped by category, click
// a card to edit it in a modal. Mirrors the picker UX in the
// POC Discovery section so the visual model stays consistent.
// ============================================================

const SYSTEM_CATEGORIES: Array<'Data' | 'API Gateway' | 'AI Authorization' | 'Application'> = [
  'Data',
  'API Gateway',
  'AI Authorization',
  'Application',
];

function SystemCatalogTab() {
  const { systemCatalog, refresh, loaded } = useDefaults();
  const [editing, setEditing] = useState<AdminDefaultSystemCatalogEntry | null>(null);
  const [creatingCategory, setCreatingCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const byCategory = useMemo(() => {
    const m = new Map<string, AdminDefaultSystemCatalogEntry[]>();
    const f = filter.trim().toLowerCase();
    for (const s of systemCatalog) {
      if (
        f &&
        !s.name.toLowerCase().includes(f) &&
        !s.defaultFocus.toLowerCase().includes(f)
      )
        continue;
      const arr = m.get(s.category) ?? [];
      arr.push(s);
      m.set(s.category, arr);
    }
    return m;
  }, [systemCatalog, filter]);

  const handleSave = async (
    patch: Omit<AdminDefaultSystemCatalogEntry, 'id' | 'isDeleted'>,
    existingId: string | null,
  ) => {
    setBusy(true);
    setError(null);
    try {
      if (existingId) {
        await updateAdminSystemCatalogEntry(existingId, patch);
      } else {
        await createAdminSystemCatalogEntry(patch);
      }
      await refresh('systemCatalog');
      setEditing(null);
      setCreatingCategory(null);
    } catch (err: any) {
      setError(err?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from the system catalog?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminSystemCatalogEntry(id);
      await refresh('systemCatalog');
      setEditing(null);
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset system catalog defaults to the factory list?')) return;
    setBusy(true);
    setError(null);
    try {
      await resetSystemCatalogToDefaults();
      await refresh('systemCatalog');
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed flex-1">
          {systemCatalog.length} system{systemCatalog.length === 1 ? '' : 's'}. The Discovery
          section's picker reads from this catalog. Use{' '}
          <code className="mono text-[11px]">{'{customer}'}</code> in the default focus —
          it's substituted with the POC's customer name at pick time.
        </div>
        <Button size="sm" variant="ghost" onClick={() => void handleReset()} disabled={busy}>
          Reset to factory defaults
        </Button>
      </div>

      <Field label="Search">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="snowflake, apigee, …"
        />
      </Field>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {SYSTEM_CATEGORIES.map((cat) => {
        const items = byCategory.get(cat) ?? [];
        if (items.length === 0 && filter.trim()) return null;
        return (
          <section key={cat} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
                {cat.toUpperCase()}
              </span>
              <span className="text-[10.5px] text-[var(--color-text-dim)]">
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCreatingCategory(cat)}
                disabled={busy}
                className="ml-auto"
              >
                + System
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEditing(s)}
                  className="text-left p-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <div className="text-[12.5px] font-medium text-[var(--color-text)] mb-0.5">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 leading-snug">
                    {s.defaultFocus}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <SystemCatalogEditor
        open={editing !== null || creatingCategory !== null}
        initial={
          editing ?? {
            id: '',
            name: '',
            category: creatingCategory ?? 'Data',
            authorizerId: '',
            defaultFocus: '',
            sortOrder:
              systemCatalog.length > 0
                ? Math.max(...systemCatalog.map((s) => s.sortOrder ?? 0)) + 10
                : 10,
          }
        }
        busy={busy}
        onClose={() => {
          setEditing(null);
          setCreatingCategory(null);
        }}
        onSave={(p) => handleSave(p, editing?.id ?? null)}
        onDelete={
          editing ? () => void handleDelete(editing.id, editing.name) : undefined
        }
      />
    </div>
  );
}

function SystemCatalogEditor({
  open,
  initial,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial: AdminDefaultSystemCatalogEntry;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Omit<AdminDefaultSystemCatalogEntry, 'id' | 'isDeleted'>) => Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [authorizerId, setAuthorizerId] = useState(initial.authorizerId);
  const [defaultFocus, setDefaultFocus] = useState(initial.defaultFocus);

  useEffect(() => {
    if (open) {
      setName(initial.name);
      setCategory(initial.category);
      setAuthorizerId(initial.authorizerId);
      setDefaultFocus(initial.defaultFocus);
    }
  }, [open, initial]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial.id ? 'Edit system' : 'Add system'}
      width={560}
    >
      <div className="space-y-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {SYSTEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Authorizer ID">
          <input
            value={authorizerId}
            onChange={(e) => setAuthorizerId(e.target.value)}
            placeholder="e.g. snowflake-authorizer"
          />
        </Field>
        <Field label="Default focus (uses {customer} as placeholder)">
          <textarea
            rows={6}
            value={defaultFocus}
            onChange={(e) => setDefaultFocus(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--color-border)]">
        <Button
          variant="primary"
          onClick={() =>
            void onSave({
              name: name.trim(),
              category: category.trim(),
              authorizerId: authorizerId.trim(),
              defaultFocus: defaultFocus.trim(),
              sortOrder: initial.sortOrder,
            })
          }
          disabled={busy || !name.trim() || !category.trim() || !authorizerId.trim()}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-[var(--color-danger)]"
          >
            Delete
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ============================================================
// Identity Providers tab — same card-grid pattern, grouped by
// providerType (Cloud IdP / Directory / IGA).
// ============================================================

const IDP_TYPES: Array<'Cloud IdP' | 'Directory' | 'IGA'> = ['Cloud IdP', 'Directory', 'IGA'];

function IdentityProvidersTab() {
  const { identityProviders, refresh, loaded } = useDefaults();
  const [editing, setEditing] = useState<AdminDefaultIdentityProviderEntry | null>(null);
  const [creatingType, setCreatingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const byType = useMemo(() => {
    const m = new Map<string, AdminDefaultIdentityProviderEntry[]>();
    const f = filter.trim().toLowerCase();
    for (const e of identityProviders) {
      if (
        f &&
        !e.name.toLowerCase().includes(f) &&
        !e.defaultNotes.toLowerCase().includes(f)
      )
        continue;
      const arr = m.get(e.providerType) ?? [];
      arr.push(e);
      m.set(e.providerType, arr);
    }
    return m;
  }, [identityProviders, filter]);

  const handleSave = async (
    patch: Omit<AdminDefaultIdentityProviderEntry, 'id' | 'isDeleted'>,
    existingId: string | null,
  ) => {
    setBusy(true);
    setError(null);
    try {
      if (existingId) {
        await updateAdminIdentityProvider(existingId, patch);
      } else {
        await createAdminIdentityProvider(patch);
      }
      await refresh('identityProviders');
      setEditing(null);
      setCreatingType(null);
    } catch (err: any) {
      setError(err?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from the identity provider catalog?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminIdentityProvider(id);
      await refresh('identityProviders');
      setEditing(null);
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset identity provider defaults to the factory list?')) return;
    setBusy(true);
    setError(null);
    try {
      await resetIdentityProvidersToDefaults();
      await refresh('identityProviders');
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="text-[12.5px] text-[var(--color-text-muted)]">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <div className="text-[12px] text-[var(--color-text-muted)] leading-relaxed flex-1">
          {identityProviders.length} provider{identityProviders.length === 1 ? '' : 's'}. The
          Discovery section's IdP picker reads from this catalog. Picking a row pre-fills
          the IdentitySource type + notes on a new POC row.
        </div>
        <Button size="sm" variant="ghost" onClick={() => void handleReset()} disabled={busy}>
          Reset to factory defaults
        </Button>
      </div>

      <Field label="Search">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="okta, active directory, …"
        />
      </Field>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {IDP_TYPES.map((ptype) => {
        const items = byType.get(ptype) ?? [];
        if (items.length === 0 && filter.trim()) return null;
        return (
          <section key={ptype} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
                {ptype.toUpperCase()}
              </span>
              <span className="text-[10.5px] text-[var(--color-text-dim)]">
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCreatingType(ptype)}
                disabled={busy}
                className="ml-auto"
              >
                + Provider
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEditing(e)}
                  className="text-left p-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-[12.5px] font-medium text-[var(--color-text)]">
                      {e.name}
                    </span>
                    <span className="mono text-[10px] text-[var(--color-text-dim)] tracking-wider">
                      {e.defaultType}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 leading-snug">
                    {e.defaultNotes}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <IdentityProviderEditor
        open={editing !== null || creatingType !== null}
        initial={
          editing ?? {
            id: '',
            name: '',
            providerType: creatingType ?? 'Cloud IdP',
            defaultType: 'Primary IdP',
            defaultNotes: '',
            sortOrder:
              identityProviders.length > 0
                ? Math.max(...identityProviders.map((e) => e.sortOrder ?? 0)) + 10
                : 10,
          }
        }
        busy={busy}
        onClose={() => {
          setEditing(null);
          setCreatingType(null);
        }}
        onSave={(p) => handleSave(p, editing?.id ?? null)}
        onDelete={
          editing ? () => void handleDelete(editing.id, editing.name) : undefined
        }
      />
    </div>
  );
}

function IdentityProviderEditor({
  open,
  initial,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial: AdminDefaultIdentityProviderEntry;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Omit<AdminDefaultIdentityProviderEntry, 'id' | 'isDeleted'>) => Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [providerType, setProviderType] = useState(initial.providerType);
  const [defaultType, setDefaultType] = useState(initial.defaultType);
  const [defaultNotes, setDefaultNotes] = useState(initial.defaultNotes);

  useEffect(() => {
    if (open) {
      setName(initial.name);
      setProviderType(initial.providerType);
      setDefaultType(initial.defaultType);
      setDefaultNotes(initial.defaultNotes);
    }
  }, [open, initial]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial.id ? 'Edit identity provider' : 'Add identity provider'}
      width={560}
    >
      <div className="space-y-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Provider type">
          <select value={providerType} onChange={(e) => setProviderType(e.target.value)}>
            {IDP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default IdentitySource type">
          <input
            value={defaultType}
            onChange={(e) => setDefaultType(e.target.value)}
            placeholder="e.g. Primary IdP, IGA, Directory"
          />
        </Field>
        <Field label="Default notes">
          <textarea
            rows={5}
            value={defaultNotes}
            onChange={(e) => setDefaultNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--color-border)]">
        <Button
          variant="primary"
          onClick={() =>
            void onSave({
              name: name.trim(),
              providerType: providerType.trim(),
              defaultType: defaultType.trim(),
              defaultNotes: defaultNotes.trim(),
              sortOrder: initial.sortOrder,
            })
          }
          disabled={busy || !name.trim() || !providerType.trim() || !defaultType.trim()}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-[var(--color-danger)]"
          >
            Delete
          </Button>
        )}
      </div>
    </Modal>
  );
}
