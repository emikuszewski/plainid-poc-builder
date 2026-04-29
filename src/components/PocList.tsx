import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Pill, EmptyState } from './ui/Primitives';
import { listPocs, deletePoc } from '../lib/client';
import { overallCompleteness } from '../lib/completeness';
import type { PocDocument } from '../types';

export function PocList({ currentUserEmail }: { currentUserEmail: string }) {
  const [pocs, setPocs] = useState<PocDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const nav = useNavigate();

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const data = await listPocs();
      // Sort by updatedAt desc
      data.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
      setPocs(data);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this POC? This cannot be undone.')) return;
    try {
      await deletePoc(id);
      refresh();
    } catch (e: any) {
      alert(`Delete failed: ${e?.message ?? e}`);
    }
  }

  const filtered =
    pocs?.filter((p) => (filter === 'mine' ? p.ownerEmail === currentUserEmail : true)) ?? null;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-8">
        <div>
          <div className="mono text-[11px] text-[var(--color-text-dim)] tracking-widest mb-1">
            DASHBOARD
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight">POCs</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-1 max-w-2xl">
            Every POC the SE team is running. Browse for inspiration, edit your own, or start a new one.
          </p>
        </div>
        <Button variant="primary" onClick={() => nav('/poc/new')}>
          + New POC
        </Button>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`mono text-[11px] tracking-widest px-2.5 py-1 rounded border ${
            filter === 'all'
              ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text)] border-[var(--color-border-strong)]'
              : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]'
          }`}
        >
          ALL · {pocs?.length ?? 0}
        </button>
        <button
          onClick={() => setFilter('mine')}
          className={`mono text-[11px] tracking-widest px-2.5 py-1 rounded border ${
            filter === 'mine'
              ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text)] border-[var(--color-border-strong)]'
              : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]'
          }`}
        >
          MINE · {pocs?.filter((p) => p.ownerEmail === currentUserEmail).length ?? 0}
        </button>
      </div>

      {error && (
        <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] text-[var(--color-danger)] text-[12px] px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {filtered === null && <div className="text-[12px] text-[var(--color-text-dim)]">Loading…</div>}

      {filtered && filtered.length === 0 && (
        <EmptyState
          title={filter === 'mine' ? "You haven't started a POC yet" : 'No POCs yet'}
          description="Start a new POC to lock down scope, success criteria, and the qualification pieces a Fifth-Third-style skeleton would skip."
          action={
            <Button variant="primary" onClick={() => nav('/poc/new')}>
              + New POC
            </Button>
          }
        />
      )}

      {filtered && filtered.length > 0 && (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
            <div className="col-span-4">CUSTOMER</div>
            <div className="col-span-3">OWNER</div>
            <div className="col-span-1">STATUS</div>
            <div className="col-span-2">COMPLETENESS</div>
            <div className="col-span-1">UPDATED</div>
            <div className="col-span-1" />
          </div>
          {filtered.map((p) => {
            const c = overallCompleteness(p);
            const isOwner = p.ownerEmail === currentUserEmail;
            return (
              <div
                key={p.id}
                className="grid grid-cols-12 gap-3 px-4 py-3 items-center border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <Link
                  to={`/poc/${p.id}`}
                  className="col-span-4 text-[13px] font-medium text-[var(--color-text)] hover:text-[var(--color-accent)]"
                >
                  {p.customerName || '(untitled)'}
                  {isOwner && (
                    <span className="mono ml-2 text-[9px] tracking-widest text-[var(--color-accent)]">
                      MINE
                    </span>
                  )}
                </Link>
                <div className="col-span-3 mono text-[11px] text-[var(--color-text-muted)] truncate">
                  {p.ownerEmail}
                </div>
                <div className="col-span-1">
                  <Pill
                    tone={
                      p.status === 'active' ? 'accent' : p.status === 'completed' ? 'neutral' : 'warning'
                    }
                  >
                    {p.status.toUpperCase()}
                  </Pill>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-[var(--color-border)] rounded">
                    <div
                      className={`h-1 rounded ${
                        c.pct === 100
                          ? 'bg-[var(--color-accent)]'
                          : c.pct >= 70
                            ? 'bg-[var(--color-warning)]'
                            : 'bg-[var(--color-text-dim)]'
                      }`}
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                  <span className="mono text-[10px] text-[var(--color-text-dim)] tabular-nums w-8 text-right">
                    {c.pct}%
                  </span>
                </div>
                <div className="col-span-1 mono text-[10px] text-[var(--color-text-dim)]">
                  {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}
                </div>
                <div className="col-span-1 flex justify-end">
                  {isOwner && p.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(p.id!)}
                      title="Delete"
                    >
                      ×
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
