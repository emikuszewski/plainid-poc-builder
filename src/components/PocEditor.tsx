import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Modal, Pill, Field } from './ui/Primitives';
import {
  CustomerSection,
  ContextSection,
  ObjectivesSection,
  DiscoverySection,
  TimelineSection,
  FrameworkSection,
  UseCasesSection,
  DependenciesSection,
  TrackerSection,
  DocsSection,
} from './sections/Sections';
import {
  createPoc,
  getPoc,
  updatePoc,
  listLibrary,
} from '../lib/client';
import { emptyPoc } from '../lib/seed-data';
import { evaluateAll, overallCompleteness } from '../lib/completeness';
import { downloadDocx, downloadHtml } from '../lib/docx-generator';
import { renderHtml } from '../lib/html-generator';
import { SECTIONS } from '../types';
import type { PocDocument, UseCaseLibraryEntry, UseCaseCategory } from '../types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export function PocEditor({ currentUserEmail }: { currentUserEmail: string }) {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const isNew = !id;

  const [poc, setPoc] = useState<PocDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [activeSection, setActiveSection] = useState('customer');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [library, setLibrary] = useState<UseCaseLibraryEntry[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<UseCaseCategory | 'All'>('All');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = !!poc && poc.ownerEmail === currentUserEmail;

  // Load POC
  useEffect(() => {
    (async () => {
      try {
        if (isNew) {
          setPoc(emptyPoc(currentUserEmail));
        } else if (id) {
          const data = await getPoc(id);
          if (!data) {
            setError('POC not found.');
            return;
          }
          setPoc(data);
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, [id, isNew, currentUserEmail]);

  // Load library (for picker)
  useEffect(() => {
    (async () => {
      try {
        setLibrary(await listLibrary());
      } catch (e) {
        console.warn('Could not load library', e);
      }
    })();
  }, []);

  // Autosave on dirty
  useEffect(() => {
    if (saveState !== 'dirty' || !poc || !isOwner) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist();
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, poc, isOwner]);

  // Track active section while scrolling
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: [0, 0.3, 0.6] },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [poc]);

  function patch(p: Partial<PocDocument>) {
    setPoc((prev) => (prev ? { ...prev, ...p } : prev));
    setSaveState('dirty');
  }

  async function persist(): Promise<PocDocument | null> {
    if (!poc) return null;
    if (!poc.customerName.trim()) {
      // Don't save without a customer name — gives the new-POC route a sensible identity.
      return null;
    }
    setSaveState('saving');
    try {
      let saved: PocDocument;
      if (poc.id) {
        saved = await updatePoc(poc.id, poc);
      } else {
        saved = await createPoc(poc);
        // Replace URL with the real id
        nav(`/poc/${saved.id}`, { replace: true });
      }
      setPoc(saved);
      setSaveState('saved');
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
      return saved;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSaveState('error');
      return null;
    }
  }

  async function exportDocx() {
    if (!poc) return;
    // Force a save first if dirty so the export reflects what's persisted
    if (saveState === 'dirty' && isOwner) await persist();
    await downloadDocx(poc);
  }

  function exportHtml() {
    if (!poc) return;
    downloadHtml(poc, renderHtml(poc, { standalone: true }));
  }

  function insertFromLibrary(entry: UseCaseLibraryEntry) {
    if (!poc) return;
    const newCase = {
      id: uid(),
      libraryId: entry.id ?? null,
      title: entry.title,
      category: entry.category,
      persona: entry.persona,
      objectives: entry.objectives,
      successCriteria: entry.successCriteria,
    };
    patch({ useCases: [...poc.useCases, newCase] });
    setPickerOpen(false);
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] text-[var(--color-danger)] px-4 py-3 rounded">
          {error}
        </div>
        <Button className="mt-4" onClick={() => nav('/')}>
          ← Back to POCs
        </Button>
      </div>
    );
  }
  if (!poc) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 mono text-[12px] text-[var(--color-text-dim)]">
        Loading…
      </div>
    );
  }

  const all = evaluateAll(poc);
  const overall = overallCompleteness(poc);

  const filteredLibrary = library.filter((e) =>
    libraryFilter === 'All' ? true : e.category === libraryFilter,
  );

  return (
    <div className="flex">
      {/* Left rail — sticky section nav with completeness indicators */}
      <aside className="hidden lg:flex flex-col w-[260px] sticky top-12 h-[calc(100vh-3rem)] border-r border-[var(--color-border)] bg-[var(--color-bg)] py-6 px-4">
        <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-3 px-2">
          SECTIONS
        </div>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => {
            const stat = all.find((a) => a.id === s.id)!;
            const complete = stat.required > 0 && stat.satisfied === stat.required;
            const isActive = activeSection === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded text-[12.5px] transition-colors ${
                  isActive
                    ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-elevated)]'
                }`}
              >
                <span className="mono text-[10px] text-[var(--color-text-dim)] w-5">{s.shortLabel}</span>
                <span className="flex-1 truncate">{s.label}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    complete
                      ? 'bg-[var(--color-accent)]'
                      : stat.satisfied > 0
                        ? 'bg-[var(--color-warning)]'
                        : 'bg-[var(--color-border-strong)]'
                  }`}
                />
              </a>
            );
          })}
        </nav>

        <div className="mt-6 px-2">
          <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-1.5">
            COMPLETENESS
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-[var(--color-border)] rounded">
              <div
                className={`h-1 rounded ${
                  overall.pct === 100
                    ? 'bg-[var(--color-accent)]'
                    : overall.pct >= 70
                      ? 'bg-[var(--color-warning)]'
                      : 'bg-[var(--color-text-dim)]'
                }`}
                style={{ width: `${overall.pct}%` }}
              />
            </div>
            <span className="mono text-[11px] tabular-nums text-[var(--color-text-muted)]">
              {overall.pct}%
            </span>
          </div>
          {overall.blockers.length > 0 && (
            <div className="mt-3 text-[11px] text-[var(--color-text-dim)] leading-snug">
              <div className="mono text-[9px] tracking-widest text-[var(--color-warning)] mb-1">
                {overall.blockers.length} OPEN
              </div>
              <ul className="space-y-0.5">
                {overall.blockers.slice(0, 4).map((b, i) => (
                  <li key={i}>· {b}</li>
                ))}
                {overall.blockers.length > 4 && (
                  <li className="text-[var(--color-text-faint)]">
                    + {overall.blockers.length - 4} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </aside>

      {/* Right pane */}
      <div className="flex-1 min-w-0">
        {/* Sticky toolbar */}
        <div className="sticky top-12 z-30 bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
          <div className="max-w-[920px] mx-auto px-6 py-3 flex items-center gap-3">
            <input
              className="!h-9 !text-[15px] !font-semibold flex-1 !bg-transparent !border-transparent hover:!border-[var(--color-border)] focus:!border-[var(--color-border-focus)] focus:!bg-[var(--color-bg-input)]"
              placeholder="Customer name…"
              value={poc.customerName}
              onChange={(e) => patch({ customerName: e.target.value })}
              disabled={!isOwner && !isNew}
            />
            <SaveIndicator state={saveState} readOnly={!isOwner && !isNew} />
            {!isOwner && !isNew && <Pill tone="neutral">READ-ONLY</Pill>}
            <select
              className="!h-8 !text-[12px] !w-auto"
              value={poc.status}
              onChange={(e) => patch({ status: e.target.value as PocDocument['status'] })}
              disabled={!isOwner && !isNew}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
            <Button size="sm" onClick={() => poc.id && nav(`/poc/${poc.id}/preview`)} disabled={!poc.id}>
              Preview
            </Button>
            <Button size="sm" variant="ghost" onClick={exportHtml}>
              HTML
            </Button>
            <Button size="sm" variant="primary" onClick={exportDocx}>
              Export DOCX
            </Button>
          </div>
        </div>

        <div className="max-w-[920px] mx-auto px-6 py-8">
          <fieldset disabled={!isOwner && !isNew} className="space-y-0">
            <CustomerSection poc={poc} set={patch} />
            <ContextSection poc={poc} set={patch} />
            <ObjectivesSection poc={poc} set={patch} />
            <DiscoverySection poc={poc} set={patch} />
            <TimelineSection poc={poc} set={patch} />
            <FrameworkSection poc={poc} set={patch} />
            <UseCasesSection
              poc={poc}
              set={patch}
              library={library}
              onOpenLibraryPicker={() => setPickerOpen(true)}
            />
            <DependenciesSection poc={poc} set={patch} />
            <TrackerSection poc={poc} set={patch} />
            <DocsSection poc={poc} set={patch} />
          </fieldset>
        </div>
      </div>

      {/* Library picker modal */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Insert from Use Case Library"
        width={840}
      >
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {(['All', 'Data', 'API Gateway', 'AI Authorization', 'Identity', 'Compliance', 'Application', 'Other'] as const).map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setLibraryFilter(cat)}
                className={`mono text-[10px] tracking-widest px-2 py-1 rounded border transition-colors ${
                  libraryFilter === cat
                    ? 'bg-[var(--color-bg)] text-[var(--color-text)] border-[var(--color-border-strong)]'
                    : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]'
                }`}
              >
                {cat.toUpperCase()}
              </button>
            ),
          )}
        </div>
        {filteredLibrary.length === 0 && (
          <div className="text-[12px] text-[var(--color-text-dim)] py-8 text-center">
            No library entries match this filter.
          </div>
        )}
        <div className="space-y-2">
          {filteredLibrary.map((e) => (
            <button
              key={e.id}
              onClick={() => insertFromLibrary(e)}
              className="w-full text-left bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-md p-3 transition-colors"
            >
              <div className="flex items-baseline gap-2 mb-1">
                <Pill tone="neutral">{e.category.toUpperCase()}</Pill>
                {e.isSystem && <Pill tone="accent">SEEDED</Pill>}
                <span className="text-[13px] font-medium text-[var(--color-text)]">{e.title}</span>
              </div>
              <div className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">
                {e.description || `${e.persona}`}
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function SaveIndicator({ state, readOnly }: { state: SaveState; readOnly: boolean }) {
  if (readOnly) return null;
  const map: Record<SaveState, { label: string; color: string }> = {
    idle: { label: '', color: 'var(--color-text-dim)' },
    dirty: { label: 'UNSAVED', color: 'var(--color-warning)' },
    saving: { label: 'SAVING…', color: 'var(--color-text-muted)' },
    saved: { label: 'SAVED', color: 'var(--color-accent)' },
    error: { label: 'ERROR', color: 'var(--color-danger)' },
  };
  const { label, color } = map[state];
  if (!label) return null;
  return (
    <span className="mono text-[10px] tracking-widest" style={{ color }}>
      {label}
    </span>
  );
}
