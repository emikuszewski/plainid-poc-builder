import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Pill } from './ui/Primitives';
import { useDefaults } from '../lib/defaults-context';
import {
  createTrackerTask,
  updateTrackerTask,
  deleteTrackerTask,
  resetTrackerToDefaults,
  listAuditLog,
} from '../lib/admin-defaults';
import type { AdminDefaultTrackerTask, AdminAuditLogEntry } from '../types';

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
      {activeTab === 'responsibilities' && <ComingSoon label="Responsibilities" />}
      {activeTab === 'personas' && <ComingSoon label="Personas" />}
      {activeTab === 'docs' && <ComingSoon label="Reference Docs" />}
      {activeTab === 'sprints' && <ComingSoon label="Sprints" />}
      {activeTab === 'boilerplate' && <ComingSoon label="Boilerplate" />}
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
// Placeholder for tabs not yet implemented in Bundle 1
// ============================================================

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-[var(--color-border)] rounded-lg px-6 py-14 text-center">
      <div className="text-[13px] font-medium">{label} — coming soon</div>
      <div className="text-[12px] text-[var(--color-text-muted)] mt-1 max-w-md mx-auto">
        Schema is deployed and the rest of the wiring is ready. The editor UI for this
        tab ships in the next bundle.
      </div>
    </div>
  );
}
