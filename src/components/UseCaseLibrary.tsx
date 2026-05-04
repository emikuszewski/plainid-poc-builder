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
import { emptyTechnicalSpec } from '../lib/technical-spec';
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

  // Multi-select state — selected entry ids in selection order.
  // The "Use" modal acts on whatever is currently selected.
  const [selection, setSelection] = useState<string[]>([]);
  const [useModalOpen, setUseModalOpen] = useState(false);
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

  // Delete state — type-to-confirm modal. Seeded entries are protected
  // (button is hidden), so this only ever holds custom entries.
  const [deleting, setDeleting] = useState<UseCaseLibraryEntry | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  function openDelete(entry: UseCaseLibraryEntry) {
    setDeleting(entry);
    setDeleteConfirmText('');
  }

  async function confirmDelete() {
    if (!deleting?.id) return;
    if (deleteConfirmText.trim() !== deleting.title.trim()) return;
    setBusy(true);
    try {
      await deleteLibraryEntry(deleting.id);
      // Drop from selection if it was selected
      setSelection((prev) => prev.filter((x) => x !== deleting.id));
      setDeleting(null);
      setDeleteConfirmText('');
      await refresh();
    } catch (e: any) {
      alert(`Delete failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  // Resolve selected ids → entries in selection order, dropping any that
  // disappeared (e.g. deleted while modal is open).
  function selectedEntries(): UseCaseLibraryEntry[] {
    const byId = new Map((entries ?? []).map((e) => [e.id ?? '', e]));
    return selection.map((id) => byId.get(id)).filter((e): e is UseCaseLibraryEntry => !!e);
  }

  function toggleSelection(id: string) {
    setSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // Open the multi-template modal. Loads the user's editable POCs lazily —
  // list call only fires when they trigger a flow.
  async function openUseModal() {
    if (selection.length === 0) return;
    setUseModalOpen(true);
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

  function startNewPocFromTemplates() {
    const ids = selectedEntries()
      .map((e) => e.id)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return;
    // Reuse the existing useCase= URL param contract by passing comma-separated ids.
    nav(`/poc/new?useCase=${encodeURIComponent(ids.join(','))}`);
    setUseModalOpen(false);
    setSelection([]);
  }

  async function addSelectedToPoc(pocId: string) {
    const picks = selectedEntries();
    if (picks.length === 0 || !pocId) return;
    const target = (myPocs ?? []).find((p) => p.id === pocId);
    if (!target) return;
    setBusy(true);
    try {
      const newCases: UseCase[] = picks.map((entry) => ({
        id: uid(),
        libraryId: entry.id ?? null,
        title: entry.title,
        category: entry.category,
        persona: entry.persona,
        objectives: entry.objectives,
        successCriteria: entry.successCriteria,
        technicalSpec: emptyTechnicalSpec(entry.category),
      }));
      const updated: PocDocument = { ...target, useCases: [...target.useCases, ...newCases] };
      await updatePoc(pocId, updated);
      setUseModalOpen(false);
      setSelection([]);
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
    <div className="max-w-[1200px] mx-auto px-6 py-8 pb-24">
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
                {items.map((e) => {
                  const selected = !!e.id && selection.includes(e.id);
                  const order = e.id ? selection.indexOf(e.id) : -1;
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => e.id && toggleSelection(e.id)}
                      onKeyDown={(ev) => {
                        if ((ev.key === 'Enter' || ev.key === ' ') && e.id) {
                          ev.preventDefault();
                          toggleSelection(e.id);
                        }
                      }}
                      className={`cursor-pointer rounded-lg p-4 transition-colors flex gap-3 items-start border ${
                        selected
                          ? 'bg-[var(--color-pill-accent-bg)] border-[var(--color-pill-accent-border)]'
                          : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          selected
                            ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                            : 'border-[var(--color-border-strong)]'
                        }`}
                        aria-hidden
                      >
                        {selected && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2 6l3 3 5-6"
                              stroke="var(--color-bg)"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-2">
                          <h3 className="text-[13px] font-medium flex-1">{e.title}</h3>
                          {selected && order >= 0 && (
                            <span className="mono text-[10px] tracking-widest text-[var(--color-accent)]">
                              #{order + 1}
                            </span>
                          )}
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setEditing(e);
                            }}
                          >
                            Edit
                          </Button>
                          {e.id && !e.isSystem && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openDelete(e);
                              }}
                            >
                              Delete
                            </Button>
                          )}
                          {e.isSystem && (
                            <span
                              className="mono text-[10px] tracking-widest text-[var(--color-text-faint)]"
                              title="Built-in templates can't be deleted"
                            >
                              PROTECTED
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
        open={useModalOpen}
        onClose={() => setUseModalOpen(false)}
        title={
          selection.length === 1
            ? `Use template: ${selectedEntries()[0]?.title ?? ''}`
            : `Use ${selection.length} templates`
        }
        width={560}
      >
        {useModalOpen && (
          <div>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mb-4 leading-relaxed">
              {selection.length === 1
                ? "The template will be copied into the POC and you can customize it from there. Subsequent edits to this template won't affect POCs that already used it."
                : `${selection.length} templates will be copied into the POC in selection order. Subsequent edits to these templates won't affect POCs that already used them.`}
            </p>

            {selection.length > 1 && (
              <div className="mb-5 border border-[var(--color-border)] rounded-md p-2.5 bg-[var(--color-bg)]">
                <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-1.5">
                  SELECTED · IN ORDER
                </div>
                <ol className="space-y-0.5">
                  {selectedEntries().map((e, i) => (
                    <li
                      key={e.id}
                      className="flex items-baseline gap-2 text-[12px] text-[var(--color-text)]"
                    >
                      <span className="mono text-[10px] text-[var(--color-text-dim)] w-5">
                        #{i + 1}
                      </span>
                      <span className="flex-1 truncate">{e.title}</span>
                      <span className="mono text-[9px] tracking-widest text-[var(--color-text-dim)]">
                        {e.category.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="mb-5">
              <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-2">
                START FRESH
              </div>
              <button
                onClick={startNewPocFromTemplates}
                disabled={busy}
                className="w-full text-left bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] hover:border-[var(--color-accent)] rounded-md p-3 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--color-text)]">
                    {selection.length === 1
                      ? 'Start new POC with this template'
                      : `Start new POC with ${selection.length} templates`}
                  </span>
                  <span className="ml-auto text-[var(--color-accent)] text-[14px]">→</span>
                </div>
                <div className="text-[11.5px] text-[var(--color-text-muted)] mt-1">
                  {selection.length === 1
                    ? 'Creates a blank POC pre-loaded with this use case'
                    : `Creates a blank POC pre-loaded with ${selection.length} use cases`}
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
                        onClick={() => p.id && addSelectedToPoc(p.id)}
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
              <Button variant="ghost" onClick={() => setUseModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation — type-to-confirm to make the action deliberate */}
      <Modal
        open={!!deleting}
        onClose={() => {
          setDeleting(null);
          setDeleteConfirmText('');
        }}
        title="Delete template"
        width={520}
      >
        {deleting && (
          <div>
            <p className="text-[12.5px] text-[var(--color-text-muted)] leading-relaxed mb-4">
              You're about to delete{' '}
              <strong className="text-[var(--color-text)]">{deleting.title}</strong>. POCs that
              already inserted this template are unaffected — they hold their own snapshot.
            </p>
            <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 mb-4">
              <p className="text-[11.5px] text-[var(--color-danger)] leading-relaxed">
                This is permanent and shared across the team. The template will no longer be
                available for anyone to insert into a new POC.
              </p>
            </div>
            <Field
              label={`Type the template name to confirm: ${deleting.title}`}
              required
            >
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleting.title}
                autoFocus
              />
            </Field>
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleting(null);
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmDelete}
                disabled={busy || deleteConfirmText.trim() !== deleting.title.trim()}
              >
                {busy ? 'Deleting…' : 'Delete template'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Sticky action bar — shown when ≥1 template selected */}
      {selection.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--color-bg-elevated)] border-t border-[var(--color-border)] shadow-lg">
          <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-3">
            <span className="mono text-[11px] tracking-widest text-[var(--color-accent)]">
              {selection.length} {selection.length === 1 ? 'TEMPLATE' : 'TEMPLATES'} SELECTED
            </span>
            <span className="text-[11.5px] text-[var(--color-text-muted)]">
              · will insert in selection order
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelection([])}>
                Clear
              </Button>
              <Button size="sm" variant="primary" onClick={openUseModal}>
                Use {selection.length === 1 ? 'template' : 'templates'} →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
