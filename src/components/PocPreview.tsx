import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from './ui/Primitives';
import { getPoc } from '../lib/client';
import { renderHtml, printStyles } from '../lib/html-generator';
import { downloadDocx, downloadHtml } from '../lib/docx-generator';
import type { PocDocument } from '../types';

export function PocPreview() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [poc, setPoc] = useState<PocDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await getPoc(id);
        if (!p) {
          setError('POC not found.');
          return;
        }
        setPoc(p);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, [id]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-[#2a1414] border border-[#4a2222] text-[var(--color-danger)] px-4 py-3 rounded">
          {error}
        </div>
        <Button className="mt-4" onClick={() => nav('/')}>
          ← Back
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

  const html = renderHtml(poc, { standalone: false });

  return (
    <div>
      <div className="sticky top-12 z-30 bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
        <div className="max-w-[1100px] mx-auto px-6 py-3 flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => nav(`/poc/${id}`)}>
            ← Back to editor
          </Button>
          <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] ml-2">
            PREVIEW · {poc.customerName}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={() => downloadHtml(poc, renderHtml(poc, { standalone: true }))}>
              Download HTML
            </Button>
            <Button size="sm" variant="primary" onClick={() => downloadDocx(poc)}>
              Download DOCX
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white py-10 min-h-[calc(100vh-3rem)]">
        <style>{printStyles()}</style>
        <div className="poc-doc" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
