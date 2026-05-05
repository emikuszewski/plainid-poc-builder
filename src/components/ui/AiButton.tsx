import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal } from './Primitives';
import { getAiNoticeAccepted, setAiNoticeAccepted } from '../../lib/ai';

/**
 * AI feature plumbing — a small ✨ button + an info icon that reveals the
 * privacy notice. On first ever click, the notice modal is shown and
 * acceptance is required to proceed. After acceptance, subsequent clicks
 * fire the action immediately; the (i) icon still opens the notice for
 * re-reading.
 */

const NOTICE_BODY =
  'AI features in Pocket send the data you provide (the prompt, including any customer-related context you have entered) to AWS Bedrock. AWS processes this data to generate a response and does not use it to train models. Avoid pasting customer-confidential data you would not share with a vendor. You can re-read this notice anytime via the (i) icon next to any AI button.';

interface AiButtonProps {
  onRun: () => void | Promise<void>;
  loading?: boolean;
  label?: string; // defaults to "Suggest"
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  title?: string;
}

export function AiButton({
  onRun,
  loading,
  label = 'Suggest',
  size = 'sm',
  className,
  disabled,
  title,
}: AiButtonProps) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [pendingRun, setPendingRun] = useState(false);

  // Load acceptance status on first render — cached after that
  useEffect(() => {
    let cancelled = false;
    getAiNoticeAccepted().then((ok) => {
      if (!cancelled) setAccepted(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (loading || disabled) return;
    if (accepted === null) return; // still loading status
    if (!accepted) {
      setPendingRun(true);
      setNoticeOpen(true);
      return;
    }
    await onRun();
  }, [accepted, loading, disabled, onRun]);

  const handleAccept = useCallback(async () => {
    await setAiNoticeAccepted();
    setAccepted(true);
    setNoticeOpen(false);
    if (pendingRun) {
      setPendingRun(false);
      await onRun();
    }
  }, [pendingRun, onRun]);

  return (
    <>
      <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
        <Button
          size={size}
          variant="ghost"
          onClick={handleClick}
          disabled={disabled || loading || accepted === null}
          title={title ?? `Generate a starter draft using AI`}
        >
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner /> Generating…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Sparkle /> {label}
            </span>
          )}
        </Button>
        <button
          type="button"
          onClick={() => {
            setPendingRun(false);
            setNoticeOpen(true);
          }}
          aria-label="About AI features"
          title="About AI features"
          className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors w-4 h-4 flex items-center justify-center text-[11px] rounded-full border border-[var(--color-border-strong)]"
        >
          i
        </button>
      </span>

      <Modal
        open={noticeOpen}
        onClose={() => {
          setNoticeOpen(false);
          setPendingRun(false);
        }}
        title="About AI features"
        width={520}
      >
        <p className="text-[12.5px] text-[var(--color-text)] leading-relaxed mb-3">
          {NOTICE_BODY}
        </p>
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button
            variant="ghost"
            onClick={() => {
              setNoticeOpen(false);
              setPendingRun(false);
            }}
          >
            {accepted ? 'Close' : 'Cancel'}
          </Button>
          {!accepted && (
            <Button variant="primary" onClick={handleAccept}>
              Got it
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}

function Sparkle() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="11"
      height="11"
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
  );
}
