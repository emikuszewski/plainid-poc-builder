import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Field, Pill, EmptyState } from './ui/Primitives';
import {
  listLibrary,
  createLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry,
  listPocs,
  updatePoc,
} from '../lib/client';
import type { PocDocument, UseCaseLibraryEntry, UseCaseCategory, UseCase } from '../types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

const CATEGORIES: (UseCaseCategory | 'All')[] = [
  'All',
  'Data',
  'API Gateway',
  'AI Authorization',
  'Identity',
  'Compliance',
  'Application',
  'Other',
];

const blankEntry = (): UseCaseLibraryEntry => ({
  title: '',
  category: 'Data',
  persona: '',
  description: '',
  objectives: '',
  successCriteria: '',
  isSystem: false,
});

export function UseCaseLibrary({ currentUserEmail }: { currentUserEmail: string }) {
  const nav = useNavigate();
  const [entries, setEntries] = useState<UseCaseLibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UseCaseCategory | 'All'>('All');
  const [editing, setEditing] = useState<UseCaseLibraryEntry | null>(null);
  const [busy, setBusy] = useState(false);

  // "Use this template" picker state
  const [usingEntry, setUsingEntry] = useState<UseCaseLibraryEntry | null>(null);
  const [myPocs, setMyPocs] = useState<PocDocument[] | null>(null);
  const [pocsLoading, setPocsLoading] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const data = await listLibrary();
      data.sort((a, b) => a.title.localeCompare(b.title));
      setEntries(data);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) {
        await updateLibraryEntry(editing.id, editing);
      } else {
        await createLibraryEntry(editing);
      }
      setEditing(null);
      await refresh();
    } catch (e: any) {
      alert(`Save failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this library entry? POCs that already inserted it are unaffected.')) return;
    try {
      await deleteLibraryEntry(id);
      refresh();
    } catch (e: any) {
      alert(`Delete failed: ${e?.message ?? e}`);
    }
  }

  // Open the "Use this template" picker. Loads the user's editable POCs
  // lazily — list call only fires when they click Use.
  async function openUsePicker(entry: UseCaseLibraryEntry) {
    setUsingEntry(entry);
    if (myPocs === null) {
      setPocsLoading(true);
      try {
        const all = await listPocs();
        setMyPocs(all.filter((p) => p.ownerEmail === currentUserEmail));
      } catch (e) {
        console.warn('Could not load POCs', e);
        setMyPocs([]);
      } finally {
        setPocsLoading(false);
      }
    }
  }

  function startNewPocFromTemplate() {
    if (!usingEntry?.id) return;
    nav(`/poc/new?useCase=${encodeURIComponent(usingEntry.id)}`);
    setUsingEntry(null);
  }

  async function addToExistingPoc(pocId: string) {
    if (!usingEntry || !pocId) return;
    const target = (myPocs ?? []).find((p) => p.id === pocId);
    if (!target) return;
    setBusy(true);
    try {
      const newCase: UseCase = {
        id: uid(),
        libraryId: usingEntry.id ?? null,
        title: usingEntry.title,
        category: usingEntry.category,
        persona: usingEntry.persona,
        objectives: usingEntry.objectives,
        successCriteria: usingEntry.successCriteria,
      };
      const updated: PocDocument = { ...target, useCases: [...target.useCases, newCase] };
      await updatePoc(pocId, updated);
      setUsingEntry(null);
      nav(`/poc/${pocId}`);
    } catch (e: any) {
      alert(`Could not add to POC: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  const filtered = entries?.filter((e) => filter === 'All' || e.category === filter) ?? null;
  const grouped: Record<string, UseCaseLibraryEntry[]> = {};
  filtered?.forEach((e) => {
    grouped[e.category] = grouped[e.category] ?? [];
    grouped[e.category].push(e);
  });

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-8">
        <div>
          <div className="mono text-[11px] text-[var(--color-text-dim)] tracking-widest mb-1">
            TEMPLATES
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight">Use Case Templates</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-1 max-w-2xl">
            Reusable building blocks. Pick one to start a new POC pre-loaded with that use case, or
            add it to a POC you're already working on. Edits here do{' '}
            <strong className="text-[var(--color-text)]">not</strong> propagate to POCs that already
            inserted them — entries are snapshotted at insertion.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing(blankEntry())}>
          + New template
        </Button>
      </header>

      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`mono text-[10px] tracking-widest px-2.5 py-1 rounded border transition-colors ${
              filter === cat
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text)] border-[var(--color-border-strong)]'
                : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]'
            }`}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] text-[var(--color-danger)] text-[12px] px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {entries === null && (
        <div className="text-[12px] text-[var(--color-text-dim)]">Loading…</div>
      )}

      {entries && entries.length === 0 && (
        <EmptyState
          title="Library is empty"
          description="The library should auto-seed on first sign-in. If it didn't, create your first entry to start building the team's playbook."
          action={
            <Button variant="primary" onClick={() => setEditing(blankEntry())}>
              + New entry
            </Button>
          }
        />
      )}

      {filtered && filtered.length > 0 && (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="mono text-[11px] tracking-widest text-[var(--color-text-dim)] mb-3">
                {category.toUpperCase()} · {items.length}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((e) => (
                  <div
                    key={e.id}
                    className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-4 hover:border-[var(--color-border-strong)] transition-colors"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <h3 className="text-[13px] font-medium flex-1">{e.title}</h3>
                      {e.isSystem && <Pill tone="accent">SEEDED</Pill>}
                    </div>
                    <div className="mono text-[10px] tracking-wider text-[var(--color-text-dim)] mb-2">
                      {e.persona}
                    </div>
                    <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed mb-3">
                      {e.description || (
                        <span className="text-[var(--color-text-faint)]">No description.</span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="primary" onClick={() => openUsePicker(e)}>
                        Use →
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                        Edit
                      </Button>
                      {e.id && (
                        <Button size="sm" variant="ghost" onClick={() => remove(e.id!)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit library entry' : 'New library entry'}
        width={760}
      >
        {editing && (
          <div>
            <Field label="Title" required>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category" required>
                <select
                  value={editing.category}
                  onChange={(e) =>
                    setEditing({ ...editing, category: e.target.value as UseCaseCategory })
                  }
                >
                  <option value="Data">Data</option>
                  <option value="API Gateway">API Gateway</option>
                  <option value="AI Authorization">AI Authorization</option>
                  <option value="Identity">Identity</option>
                  <option value="Compliance">Compliance</option>
                  <option value="Application">Application</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Persona">
                <input
                  value={editing.persona}
                  onChange={(e) => setEditing({ ...editing, persona: e.target.value })}
                />
              </Field>
            </div>
            <Field
              label="Description"
              hint="Short tagline shown on library cards and the picker."
            >
              <textarea
                rows={2}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
            <Field label="Objectives" hint="One bullet per line.">
              <textarea
                rows={5}
                value={editing.objectives}
                onChange={(e) => setEditing({ ...editing, objectives: e.target.value })}
              />
            </Field>
            <Field label="Success criteria" hint="One bullet per line.">
              <textarea
                rows={5}
                value={editing.successCriteria}
                onChange={(e) => setEditing({ ...editing, successCriteria: e.target.value })}
              />
            </Field>
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={busy || !editing.title.trim()}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!usingEntry}
        onClose={() => setUsingEntry(null)}
        title={usingEntry ? `Use template: ${usingEntry.title}` : 'Use template'}
        width={560}
      >
        {usingEntry && (
          <div>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mb-5 leading-relaxed">
              The template will be copied into the POC and you can customize it from there.
              Subsequent edits to this template won't affect POCs that already used it.
            </p>

            <div className="mb-5">
              <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-2">
                START FRESH
              </div>
              <button
                onClick={startNewPocFromTemplate}
                disabled={busy}
                className="w-full text-left bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] hover:border-[var(--color-accent)] rounded-md p-3 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--color-text)]">
                    Start new POC with this template
                  </span>
                  <span className="ml-auto text-[var(--color-accent)] text-[14px]">→</span>
                </div>
                <div className="text-[11.5px] text-[var(--color-text-muted)] mt-1">
                  Creates a blank POC pre-loaded with this use case
                </div>
              </button>
            </div>

            <div>
              <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-2">
                ADD TO EXISTING POC
              </div>
              {pocsLoading && (
                <div className="text-[12px] text-[var(--color-text-dim)] py-3">Loading your POCs…</div>
              )}
              {!pocsLoading && myPocs && myPocs.length === 0 && (
                <div className="text-[12px] text-[var(--color-text-dim)] py-3 px-3 border border-dashed border-[var(--color-border)] rounded">
                  You don't own any POCs yet. Use the option above to start one.
                </div>
              )}
              {!pocsLoading && myPocs && myPocs.length > 0 && (
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                  {myPocs
                    .slice()
                    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => p.id && addToExistingPoc(p.id)}
                        disabled={busy}
                        className="w-full text-left bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-md px-3 py-2 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-[var(--color-text)] truncate">
                            {p.customerName || '(untitled)'}
                          </div>
                          <div className="mono text-[10px] text-[var(--color-text-dim)]">
                            {p.status.toUpperCase()} ·{' '}
                            {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}
                          </div>
                        </div>
                        <span className="text-[var(--color-text-dim)] text-[14px]">→</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[var(--color-border)]">
              <Button variant="ghost" onClick={() => setUsingEntry(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
