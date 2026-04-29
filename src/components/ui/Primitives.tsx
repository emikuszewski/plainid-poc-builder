import React from 'react';

// ============================================================
// Button
// ============================================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center gap-2 rounded-md font-medium transition-colors duration-100 disabled:opacity-40 disabled:cursor-not-allowed border';
  const sizes = {
    sm: 'text-[12px] px-2.5 py-1 h-7',
    md: 'text-[13px] px-3 py-1.5 h-8',
  };
  const variants = {
    primary:
      'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] hover:border-[var(--color-accent-hover)]',
    secondary:
      'bg-[var(--color-bg-elevated)] text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-strong)]',
    ghost:
      'bg-transparent text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)] hover:bg-[var(--color-bg-elevated)]',
    danger:
      'bg-transparent text-[var(--color-danger)] border-[var(--color-border)] hover:bg-[var(--color-pill-danger-bg)] hover:border-[var(--color-danger)]',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// ============================================================
// Field wrapper with label + hint
// ============================================================
interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, hint, required, children, className = '' }: FieldProps) {
  return (
    <div className={`mb-4 ${className}`}>
      <label className="flex items-center gap-1.5">
        <span>{label}</span>
        {required && <span className="text-[var(--color-accent)]">·</span>}
      </label>
      {children}
      {hint && (
        <div className="mt-1 text-[11px] text-[var(--color-text-dim)] leading-snug">{hint}</div>
      )}
    </div>
  );
}

// ============================================================
// Section card
// ============================================================
interface SectionCardProps {
  id?: string;
  title: string;
  number?: string;
  description?: string;
  status?: { satisfied: number; required: number };
  children: React.ReactNode;
}

export function SectionCard({ id, title, number, description, status, children }: SectionCardProps) {
  const pct = status && status.required > 0 ? (status.satisfied / status.required) * 100 : 0;
  const complete = status && status.satisfied === status.required && status.required > 0;
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <header className="flex items-baseline gap-3 mb-1 pb-3 border-b border-[var(--color-border)]">
        {number && (
          <span className="mono text-[11px] text-[var(--color-text-dim)] tracking-widest font-medium">
            {number}
          </span>
        )}
        <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
        {status && (
          <span
            className={`mono text-[10px] tracking-widest ml-auto ${
              complete ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'
            }`}
          >
            {status.satisfied}/{status.required}
            <span className="ml-2 inline-block w-12 h-[2px] bg-[var(--color-border)] align-middle relative top-[-1px]">
              <span
                className={`absolute inset-y-0 left-0 ${
                  complete ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-text-dim)]'
                }`}
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
        )}
      </header>
      {description && (
        <p className="text-[12.5px] text-[var(--color-text-muted)] mb-5 leading-relaxed max-w-3xl">
          {description}
        </p>
      )}
      <div>{children}</div>
    </section>
  );
}

// ============================================================
// Pill / badge
// ============================================================
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)]',
    accent: 'bg-[var(--color-pill-accent-bg)] text-[var(--color-accent)] border-[var(--color-pill-accent-border)]',
    warning: 'bg-[var(--color-pill-warning-bg)] text-[var(--color-warning)] border-[var(--color-pill-warning-border)]',
    danger: 'bg-[var(--color-pill-danger-bg)] text-[var(--color-danger)] border-[var(--color-pill-danger-border)]',
  };
  return (
    <span
      className={`mono inline-flex items-center text-[10px] tracking-widest px-1.5 py-0.5 rounded border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// ============================================================
// Modal (no library, no portal — overlay div)
// ============================================================
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 720,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-strong)] rounded-lg shadow-2xl w-full mx-6 max-h-[80vh] flex flex-col"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ============================================================
// Empty state
// ============================================================
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-[var(--color-border)] rounded-lg px-6 py-8 text-center">
      <div className="text-[13px] font-medium text-[var(--color-text)]">{title}</div>
      {description && (
        <div className="text-[12px] text-[var(--color-text-muted)] mt-1 mb-3 max-w-md mx-auto">
          {description}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
