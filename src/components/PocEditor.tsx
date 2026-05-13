import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Modal, Pill, Field } from './ui/Primitives';
import { AiButton } from './ui/AiButton';
import {
  CustomerSection,
  ContextSection,
  ObjectivesSection,
  DiscoverySection,
  TimelineSection,
  TeamSection,
  FrameworkSection,
  UseCasesSection,
  DependenciesSection,
  TrackerSection,
  DocsSection,
} from './sections/Sections';
import { TechnicalSection } from './sections/TechnicalSection';
import {
  createPoc,
  getPoc,
  updatePoc,
  listLibrary,
} from '../lib/client';
import { emptyPoc } from '../lib/seed-data';
import { useDefaults, projectTracker } from '../lib/defaults-context';
import { emptyTechnicalSpec } from '../lib/technical-spec';
import { evaluateAll, overallCompleteness } from '../lib/completeness';
import { downloadDocx, downloadHtml } from '../lib/docx-generator';
import { renderHtml } from '../lib/html-generator';
import { SECTIONS } from '../types';
import type { PocDocument, UseCaseLibraryEntry, UseCaseCategory } from '../types';
import { generate, startAiJob } from '../lib/ai';
import { client } from '../lib/client';
import { buildReviewPocPrompt, parseReview, type ReviewResult } from '../lib/ai-prompts';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export function PocEditor({ currentUserEmail }: { currentUserEmail: string }) {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const seedUseCaseId = searchParams.get('useCase');
  const nav = useNavigate();
  const isNew = !id;

  const [poc, setPoc] = useState<PocDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [activeSection, setActiveSection] = useState('customer');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [library, setLibrary] = useState<UseCaseLibraryEntry[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<UseCaseCategory | 'All'>('All');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = !!poc && poc.ownerEmail === currentUserEmail;

  // Pull live admin defaults to seed new POCs. When admin tables are
  // empty (first run after deploy), emptyPoc falls back to the hardcoded
  // seeds in seed-data.ts.
  const defaults = useDefaults();

  // Load POC
  useEffect(() => {
    (async () => {
      try {
        if (isNew) {
          setPoc(
            emptyPoc(currentUserEmail, {
              tracker: projectTracker(defaults.tracker),
            }),
          );
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
    // Re-running this when defaults change isn't important — by the time
    // the editor is mounted, defaults are loaded. We do depend on
    // defaults.loaded so the very first new-POC after a fresh page load
    // waits for defaults to finish loading.
  }, [id, isNew, currentUserEmail, defaults.loaded, defaults.tracker]);

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

  // If the new POC was launched from library cards (URL has ?useCase=<id>
  // or ?useCase=<id1>,<id2>,<id3>), pre-load those use cases into the empty
  // POC. Runs once when both poc and library are ready, then strips the
  // query param so it doesn't re-fire.
  useEffect(() => {
    if (!isNew || !poc || poc.useCases.length > 0 || !seedUseCaseId || library.length === 0) return;
    const ids = seedUseCaseId.split(',').map((s) => s.trim()).filter(Boolean);
    const entries = ids
      .map((id) => library.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e);
    if (entries.length === 0) {
      // All library entries were deleted between picker click and editor load
      setSearchParams({}, { replace: true });
      return;
    }
    setPoc((prev) =>
      prev
        ? {
            ...prev,
            useCases: entries.map((entry) => ({
              id: uid(),
              libraryId: entry.id ?? null,
              title: entry.title,
              category: entry.category,
              persona: entry.persona,
              objectives: entry.objectives,
              successCriteria: entry.successCriteria,
              technicalSpec: emptyTechnicalSpec(entry.category),
            })),
          }
        : prev,
    );
    setSearchParams({}, { replace: true });
  }, [isNew, poc, library, seedUseCaseId, setSearchParams]);

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

  // ---- AI: Review POC ----
  // Job-based: the Review feature uses the async startAiJob path so it
  // can take as long as it needs. We track "the latest review job for
  // this POC" and poll it while status is 'pending'.
  //
  // Status mapping (used by the icon):
  //   null              → idle  (no job ever run, or job aged out)
  //   'pending'         → running (spinner)
  //   'complete'        → ✓ checkmark icon, modal shows parsed review
  //   'error'           → ! exclamation icon, modal shows error + Re-run
  //
  // Re-running creates a new AiJob row, displacing the previous one in
  // the "latest" lookup.
  interface ReviewJob {
    id: string;
    status: 'pending' | 'complete' | 'error';
    result: string | null;
    errorMessage: string | null;
    completedAt: string | null;
    createdAt: string;
  }
  const [reviewJob, setReviewJob] = useState<ReviewJob | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewStarting, setReviewStarting] = useState(false);

  // Polling: while reviewJob.status === 'pending', re-fetch the AiJob row
  // every 3 seconds until it flips to complete or error. The interval is
  // cleared on unmount, on POC switch, or when the status settles.
  const pollTimerRef = useRef<number | null>(null);

  // ---- Open Items modal — opened from either the "N OPEN" badge or the
  // "+ N more" tail of the sidebar blockers preview.
  const [openItemsModalOpen, setOpenItemsModalOpen] = useState(false);

  // ---- First-incomplete section auto-open.
  // We compute this once when the POC first loads (snapshotting which
  // section the SE should land on) and don't update it as they edit —
  // otherwise the section they're filling out would close on them once
  // its blockers cleared, which is jarring. Captured per-POC: switching
  // POCs recomputes it for the new one.
  const [firstIncompleteId, setFirstIncompleteId] = useState<string | null>(null);
  const pinnedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!poc) return;
    if (pinnedFor.current === poc.id) return;
    pinnedFor.current = poc.id ?? null;
    const sections = evaluateAll(poc);
    const firstWithIssues = sections.find((s) => s.issues.length > 0);
    setFirstIncompleteId(firstWithIssues?.id ?? null);
  }, [poc]);

  // Load the latest review job for this POC on mount (so a previously
  // completed review still shows ✓ + opens with its cached result).
  // Also load on POC switch.
  useEffect(() => {
    if (!poc?.id) return;
    const pocId = poc.id;
    let cancelled = false;
    (async () => {
      try {
        const { data, errors } = await client.models.AiJob.list({
          filter: {
            pocId: { eq: pocId },
            feature: { eq: 'review-poc' },
            ownerEmail: { eq: currentUserEmail },
          },
        });
        if (cancelled) return;
        if (errors && errors.length > 0) {
          console.warn('AiJob list returned errors', errors);
          return;
        }
        if (!data || data.length === 0) {
          setReviewJob(null);
          return;
        }
        // Sort newest first by createdAt and pick the latest.
        const sorted = [...data].sort((a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
        );
        const latest = sorted[0];
        if (!latest) return;
        setReviewJob({
          id: latest.id,
          status: (latest.status as ReviewJob['status']) ?? 'pending',
          result: latest.result ?? null,
          errorMessage: latest.errorMessage ?? null,
          completedAt: latest.completedAt ?? null,
          createdAt: latest.createdAt ?? new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Could not load latest AiJob for POC', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poc?.id]);

  // Polling effect — runs while the current job is pending.
  useEffect(() => {
    // Cleanup any prior timer first.
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (!reviewJob || reviewJob.status !== 'pending') return;

    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await client.models.AiJob.get({ id: reviewJob.id });
        if (cancelled || !data) return;
        const next: ReviewJob = {
          id: data.id,
          status: (data.status as ReviewJob['status']) ?? 'pending',
          result: data.result ?? null,
          errorMessage: data.errorMessage ?? null,
          completedAt: data.completedAt ?? null,
          createdAt: data.createdAt ?? reviewJob.createdAt,
        };
        setReviewJob(next);
        if (next.status === 'pending') {
          pollTimerRef.current = window.setTimeout(tick, 3000);
        }
      } catch (err) {
        console.warn('AiJob poll failed', err);
        if (!cancelled) {
          // Try again — transient network errors shouldn't kill polling.
          pollTimerRef.current = window.setTimeout(tick, 5000);
        }
      }
    };
    pollTimerRef.current = window.setTimeout(tick, 3000);
    return () => {
      cancelled = true;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [reviewJob?.id, reviewJob?.status]);

  // Parsed review (derived from the latest complete job's result string).
  // Recomputed when reviewJob changes — cheap relative to render cost.
  const parsedReview: ReviewResult | null =
    reviewJob?.status === 'complete' && reviewJob.result
      ? parseReview(reviewJob.result)
      : null;

  async function startReview() {
    if (!poc?.id) return;
    setReviewStarting(true);
    try {
      const built = buildReviewPocPrompt(poc);
      const jobId = await startAiJob({
        feature: 'review-poc',
        pocId: poc.id,
        prompt: built.prompt,
        system: built.system,
        maxTokens: built.maxTokens,
        modelId: built.modelId,
      });
      // Optimistic: set the new job to pending immediately so the icon
      // shows the spinner. The polling effect picks it up.
      setReviewJob({
        id: jobId,
        status: 'pending',
        result: null,
        errorMessage: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Failed to start review', err);
      // Surface as an error-state job so the user can see what happened.
      setReviewJob({
        id: 'error-' + Date.now(),
        status: 'error',
        result: null,
        errorMessage: err?.message ?? 'Failed to start review',
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    } finally {
      setReviewStarting(false);
    }
  }

  /**
   * Toolbar Review-button click handler. Behavior depends on current state:
   *
   *   - Idle (no job ever run)        → kick a new job, do NOT open modal.
   *                                     User sees the button flip to a
   *                                     spinner; they go back to editing.
   *   - Pending (job in flight)       → no-op. User already knows it's
   *                                     running because the icon is spinning.
   *   - Complete (✓)                  → open modal, show cached result.
   *   - Error (!)                     → open modal, show error + Re-run.
   *
   * The modal does not auto-open on a fresh run anymore — the whole point
   * of the async pattern is for the user to keep working while it runs.
   */
  function openReview() {
    if (reviewJob?.status === 'pending' || reviewStarting) {
      // Already running — clicking again would just cancel any pending
      // intent; keep it simple and ignore.
      return;
    }
    if (!reviewJob) {
      // First time on this POC — kick the job, don't open the modal.
      void startReview();
      return;
    }
    if (reviewJob.status === 'complete' || reviewJob.status === 'error') {
      // We have a result (or an error) to show — open the modal.
      setReviewModalOpen(true);
    }
  }

  // Derived UI state for the AiButton in the toolbar.
  const reviewIconState = {
    loading: reviewJob?.status === 'pending' || reviewStarting,
    complete: reviewJob?.status === 'complete',
    error: reviewJob?.status === 'error',
  };

  function insertSelectedFromLibrary() {
    if (!poc || pickerSelection.length === 0) return;
    // Build use cases in selection order (matches user's pick order)
    const newCases = pickerSelection
      .map((id) => library.find((e) => e.id === id))
      .filter((e): e is UseCaseLibraryEntry => !!e)
      .map((entry) => ({
        id: uid(),
        libraryId: entry.id ?? null,
        title: entry.title,
        category: entry.category,
        persona: entry.persona,
        objectives: entry.objectives,
        successCriteria: entry.successCriteria,
        technicalSpec: emptyTechnicalSpec(entry.category),
      }));
    patch({ useCases: [...poc.useCases, ...newCases] });
    setPickerSelection([]);
    setPickerOpen(false);
  }

  function togglePickerSelection(id: string) {
    setPickerSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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

  // Derived values for the open-items modal (declared at top with other hooks).
  // These are recomputed on every render, no hooks involved.
  const openSections = all.filter((s) => s.issues.length > 0);
  const sectionMetaById = new Map(SECTIONS.map((s) => [s.id, s]));

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
            // Defensive: fall back to an empty status if a section's
            // completeness isn't computed (e.g. SECTIONS contains a new
            // section that hasn't been wired into evaluateSection yet).
            // Previously a missing entry crashed the sidebar.
            const stat = all.find((a) => a.id === s.id) ?? {
              id: s.id,
              satisfied: 0,
              required: 0,
              issues: [],
            };
            const complete = stat.required > 0 && stat.satisfied === stat.required;
            const isActive = activeSection === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const node = document.getElementById(s.id);
                  if (!node) return;
                  // Expand if collapsed, then scroll
                  const headerEl = node.querySelector<HTMLElement>(
                    '[role="button"][aria-expanded]',
                  );
                  if (headerEl?.getAttribute('aria-expanded') === 'false') {
                    headerEl.click();
                  }
                  node.scrollIntoView({ behavior: 'smooth' });
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
              <button
                type="button"
                onClick={() => setOpenItemsModalOpen(true)}
                className="mono text-[9px] tracking-widest text-[var(--color-warning)] mb-1 hover:underline cursor-pointer"
              >
                {overall.blockers.length} OPEN
              </button>
              <ul className="space-y-0.5">
                {overall.blockers.slice(0, 4).map((b, i) => (
                  <li key={i}>· {b}</li>
                ))}
                {overall.blockers.length > 4 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setOpenItemsModalOpen(true)}
                      className="text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] hover:underline cursor-pointer"
                    >
                      + {overall.blockers.length - 4} more
                    </button>
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
            <AiButton
              label="Review"
              onRun={openReview}
              loading={reviewIconState.loading}
              complete={reviewIconState.complete}
              error={reviewIconState.error}
              title={
                reviewIconState.loading
                  ? 'AI review running in the background — icon will turn green when done'
                  : reviewIconState.complete
                  ? 'AI review complete — click to view results'
                  : reviewIconState.error
                  ? 'AI review failed — click to see details and retry'
                  : 'Run an AI quality review of this POC document'
              }
            />
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
            <CustomerSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <ContextSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <ObjectivesSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <DiscoverySection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <UseCasesSection
              poc={poc}
              set={patch}
              firstIncompleteId={firstIncompleteId}
              library={library}
              onOpenLibraryPicker={() => setPickerOpen(true)}
            />
            <TechnicalSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <TimelineSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <TeamSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <FrameworkSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <DependenciesSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <TrackerSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
            <DocsSection poc={poc} set={patch} firstIncompleteId={firstIncompleteId} />
          </fieldset>
        </div>
      </div>

      {/* Mirror right-rail spacer — same width as the left sidebar. Keeps
          the centered editor pane visually balanced on wide screens. Hides
          below the lg breakpoint to match the sidebar's own behavior. */}
      <div aria-hidden className="hidden lg:block w-[260px] flex-shrink-0" />

      {/* Library picker modal — multi-select */}
      <Modal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPickerSelection([]);
        }}
        title="Insert from Use Case Templates"
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
        <div className="space-y-2 mb-4">
          {filteredLibrary.map((e) => {
            const selected = !!e.id && pickerSelection.includes(e.id);
            const order = e.id ? pickerSelection.indexOf(e.id) : -1;
            return (
              <button
                key={e.id}
                onClick={() => e.id && togglePickerSelection(e.id)}
                className={`w-full text-left border rounded-md p-3 transition-colors flex gap-3 items-start ${
                  selected
                    ? 'bg-[var(--color-pill-accent-bg)] border-[var(--color-pill-accent-border)]'
                    : 'bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
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
                  <div className="flex items-baseline gap-2 mb-1">
                    <Pill tone="neutral">{e.category.toUpperCase()}</Pill>
                    {e.isSystem && <Pill tone="accent">SEEDED</Pill>}
                    {selected && order >= 0 && (
                      <span className="mono text-[10px] tracking-widest text-[var(--color-accent)]">
                        #{order + 1}
                      </span>
                    )}
                    <span className="text-[13px] font-medium text-[var(--color-text)]">{e.title}</span>
                  </div>
                  <div className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">
                    {e.description || `${e.persona}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 bg-[var(--color-bg-elevated)] border-t border-[var(--color-border)] flex items-center justify-between">
          <span className="text-[11.5px] text-[var(--color-text-muted)]">
            {pickerSelection.length === 0
              ? 'Select one or more templates to insert.'
              : `${pickerSelection.length} selected · will insert in selection order`}
          </span>
          <div className="flex items-center gap-2">
            {pickerSelection.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setPickerSelection([])}>
                Clear
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={insertSelectedFromLibrary}
              disabled={pickerSelection.length === 0}
            >
              Add {pickerSelection.length || ''} →
            </Button>
          </div>
        </div>
      </Modal>

      {/* AI: Review POC modal */}
      <Modal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="POC Review"
        width={760}
      >
        <p className="text-[12.5px] text-[var(--color-text-muted)] mb-4 leading-relaxed">
          AI quality review of this POC. Findings are organized by severity. Use these as
          prompts for your own judgment — the SE owns the document.
        </p>

        {reviewJob?.status === 'pending' && (
          <div className="flex items-center justify-center gap-2.5 py-10 text-[12.5px] text-[var(--color-text-muted)]">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
              className="animate-spin"
            >
              <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
              <path d="M8 2a6 6 0 0 1 6 6" />
            </svg>
            <span>
              Reviewing in the background. You can close this modal and come back — the
              icon up top will turn green when results are ready.
            </span>
          </div>
        )}

        {reviewJob?.status === 'error' && (
          <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 mb-4">
            <p className="text-[12px] text-[var(--color-danger)]">
              {reviewJob.errorMessage ?? 'Review failed'}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReviewModalOpen(false);
                void startReview();
              }}
              className="mt-2"
            >
              Try again
            </Button>
          </div>
        )}

        {reviewJob?.status === 'complete' && !parsedReview && (
          <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 mb-4">
            <p className="text-[12px] text-[var(--color-danger)]">
              AI returned a response in an unexpected format. Please try again.
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReviewModalOpen(false);
                void startReview();
              }}
              className="mt-2"
            >
              Re-run
            </Button>
          </div>
        )}

        {parsedReview && (
          <div className="space-y-5">
            <div className="flex items-baseline gap-2">
              <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
                SUMMARY
              </div>
              {reviewJob?.completedAt && (
                <div className="text-[10px] text-[var(--color-text-dim)] ml-auto mono tracking-wider">
                  {formatRelativeTime(reviewJob.completedAt)}
                </div>
              )}
            </div>
            <p className="text-[13px] text-[var(--color-text)] leading-relaxed -mt-3">
              {parsedReview.summary}
            </p>

            {parsedReview.issues.length > 0 && (
              <div>
                <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-2">
                  ISSUES · {parsedReview.issues.length}
                </div>
                <div className="space-y-2">
                  {parsedReview.issues.map((issue, i) => {
                    const tone =
                      issue.severity === 'critical'
                        ? 'danger'
                        : issue.severity === 'warning'
                          ? 'warning'
                          : 'neutral';
                    return (
                      <div
                        key={i}
                        className="border border-[var(--color-border)] rounded-md p-3 bg-[var(--color-bg)]"
                      >
                        <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                          <Pill tone={tone}>{issue.severity.toUpperCase()}</Pill>
                          {issue.section && (
                            <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
                              {issue.section.toUpperCase()}
                            </span>
                          )}
                          <span className="text-[13px] font-medium text-[var(--color-text)]">
                            {issue.title}
                          </span>
                        </div>
                        <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
                          {issue.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {parsedReview.strengths.length > 0 && (
              <div>
                <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-2">
                  STRENGTHS · {parsedReview.strengths.length}
                </div>
                <ul className="space-y-1">
                  {parsedReview.strengths.map((s, i) => (
                    <li
                      key={i}
                      className="text-[12.5px] text-[var(--color-text-muted)] leading-relaxed flex gap-2"
                    >
                      <span className="text-[var(--color-accent)] mt-0.5">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-[var(--color-border)]">
          <Button
            variant="ghost"
            onClick={() => {
              setReviewModalOpen(false);
              void startReview();
            }}
            disabled={reviewJob?.status === 'pending' || reviewStarting}
          >
            Re-run
          </Button>
          <Button variant="ghost" onClick={() => setReviewModalOpen(false)}>
            Close
          </Button>
        </div>
      </Modal>

      {/* Open items modal — full list grouped by section */}
      <Modal
        open={openItemsModalOpen}
        onClose={() => setOpenItemsModalOpen(false)}
        title={`Open items · ${overall.blockers.length}`}
        width={640}
      >
        <p className="text-[12.5px] text-[var(--color-text-muted)] mb-4 leading-relaxed">
          Everything still missing or thin in this POC, grouped by section. Click a
          section name to jump to it in the editor.
        </p>
        {openSections.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-[var(--color-text-muted)]">
            Nothing open — this POC is complete.
          </div>
        ) : (
          <div className="space-y-4">
            {openSections.map((s) => {
              const meta = sectionMetaById.get(s.id);
              return (
                <div key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // Scroll to the section in the editor and briefly flash
                      // its background so the SE sees where they landed. Also
                      // expand the section if it's currently collapsed —
                      // otherwise the scroll target is just the header bar.
                      const node = document.getElementById(s.id);
                      if (!node) return;
                      setOpenItemsModalOpen(false);
                      // The first child of the SectionCard's <section> is the
                      // clickable header. Clicking it toggles open state. If
                      // it's already open, clicking would CLOSE it — so check
                      // aria-expanded first and only click when closed.
                      const headerEl = node.querySelector<HTMLElement>(
                        '[role="button"][aria-expanded]',
                      );
                      if (headerEl?.getAttribute('aria-expanded') === 'false') {
                        headerEl.click();
                      }
                      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      node.classList.add(
                        'bg-[var(--color-pill-accent-bg)]',
                        'transition-colors',
                        'duration-500',
                        'rounded-md',
                      );
                      window.setTimeout(() => {
                        node.classList.remove(
                          'bg-[var(--color-pill-accent-bg)]',
                          'rounded-md',
                        );
                      }, 1600);
                    }}
                    className="flex items-baseline gap-2 mb-1.5 group cursor-pointer"
                  >
                    <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
                      {meta?.shortLabel ?? s.id.toUpperCase()}
                    </span>
                    <span className="text-[13px] font-medium text-[var(--color-text)] group-hover:text-[var(--color-accent)] transition-colors">
                      {meta?.label ?? s.id}
                    </span>
                    <span className="mono text-[10px] tracking-widest text-[var(--color-warning)]">
                      {s.issues.length} {s.issues.length === 1 ? 'ITEM' : 'ITEMS'}
                    </span>
                  </button>
                  <ul className="space-y-0.5 ml-1 text-[12px] text-[var(--color-text-muted)]">
                    {s.issues.map((issue, i) => (
                      <li key={i} className="leading-snug">
                        · {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[var(--color-border)]">
          <Button variant="ghost" onClick={() => setOpenItemsModalOpen(false)}>
            Close
          </Button>
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

/**
 * Short human-readable "time ago" formatter for AiJob completion timestamps.
 * Examples: "just now", "5m ago", "2h ago", "3d ago", "Mar 4".
 */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
