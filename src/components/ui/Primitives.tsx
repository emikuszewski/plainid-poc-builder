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
  /** Optional inline action rendered on the right of the label row — e.g. an AI Suggest button. */
  action?: React.ReactNode;
}

export function Field({ label, hint, required, children, className = '', action }: FieldProps) {
  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="flex items-center gap-1.5 mb-0">
          <span>{label}</span>
          {required && <span className="text-[var(--color-accent)]">·</span>}
        </label>
        {action && <span className="flex-shrink-0">{action}</span>}
      </div>
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
  /**
   * Optional one-line preview rendered in the collapsed header instead
   * of the description. Helps the SE scan closed accordions.
   */
  summary?: string;
  /**
   * Controls whether the section starts open. Computed by the parent
   * editor using the "first incomplete section" rule. Sections render
   * uncollapsed when this is true; collapsed otherwise. The SE can
   * always toggle by clicking the header.
   */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function SectionCard({
  id,
  title,
  number,
  description,
  status,
  summary,
  defaultOpen = true,
  children,
}: SectionCardProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const pct = status && status.required > 0 ? (status.satisfied / status.required) * 100 : 0;
  const complete = status && status.satisfied === status.required && status.required > 0;
  return (
    <section
      id={id}
      className={`mb-3 scroll-mt-20 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-elevated)] overflow-hidden transition-colors ${
        open ? 'border-[var(--color-border-strong)]' : ''
      }`}
    >
      <header
        className="flex items-baseline gap-3 px-4 py-3 cursor-pointer select-none hover:bg-[var(--color-bg-hover)] transition-colors"
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        {number && (
          <span className="mono text-[11px] text-[var(--color-text-dim)] tracking-widest font-medium">
            {number}
          </span>
        )}
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {/* Collapsed summary — hidden when section is open so the description shows */}
        {!open && summary && (
          <span className="text-[12px] text-[var(--color-text-muted)] truncate min-w-0 flex-1">
            {summary}
          </span>
        )}
        {status && (
          <span
            className={`mono text-[10px] tracking-widest ${open ? 'ml-auto' : ''} ${
              !open && !summary ? 'ml-auto' : ''
            } ${complete ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'}`}
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
        <span
          className={`text-[var(--color-text-dim)] text-[10px] transition-transform ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden
        >
          ▶
        </span>
      </header>
      {open && (
        <div className="px-4 pb-5 pt-1 border-t border-[var(--color-border)]">
          {description && (
            <p className="text-[12.5px] text-[var(--color-text-muted)] mb-5 leading-relaxed max-w-3xl mt-3">
              {description}
            </p>
          )}
          <div>{children}</div>
        </div>
      )}
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

// ============================================================
// Collapsible card row
//
// One-line summary header that toggles to show fields below. Used for
// list items inside sections (use cases, in-scope systems, identity
// providers, team members, personas, reference docs). Replaces the
// always-expanded card-per-item rendering — same data, much less
// scrolling.
//
// `useExpandedSet` companion hook below manages which rows are open.
// ============================================================

export function CollapsibleCard({
  expanded,
  onToggle,
  header,
  children,
  className = '',
}: {
  expanded: boolean;
  onToggle: () => void;
  /** One-line header — usually a flex row with summary + actions on right */
  header: React.ReactNode;
  /** Fields shown when expanded */
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border border-[var(--color-border)] rounded-md bg-[var(--color-bg-elevated)] overflow-hidden transition-colors ${
        expanded ? 'border-[var(--color-border-strong)]' : ''
      } ${className}`}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors"
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
      >
        <span
          className={`text-[var(--color-text-dim)] text-[9px] transition-transform flex-shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
          aria-hidden
        >
          ▶
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-2">{header}</div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-[var(--color-border)]">{children}</div>
      )}
    </div>
  );
}

/**
 * Manages which items in a list are currently expanded. New items added
 * after first render are automatically opened so the SE can immediately
 * fill them in (pairs with the existing useFocusOnAppend behavior).
 *
 * Usage:
 *   const expanded = useExpandedSet(items.map(i => i.id));
 *   ...
 *   <CollapsibleCard
 *     expanded={expanded.isOpen(item.id)}
 *     onToggle={() => expanded.toggle(item.id)}
 *     ...
 *   />
 */
export function useExpandedSet(currentIds: string[]) {
  const [openSet, setOpenSet] = React.useState<Set<string>>(new Set());
  const seenIds = React.useRef<Set<string>>(new Set(currentIds));

  // When the id list grows, mark the new ids as open. We compare against
  // a ref so we only open ids on the render where they first appeared,
  // not every render.
  React.useEffect(() => {
    const previouslySeen = seenIds.current;
    const newlyAdded: string[] = [];
    for (const id of currentIds) {
      if (!previouslySeen.has(id)) newlyAdded.push(id);
    }
    if (newlyAdded.length > 0) {
      setOpenSet((prev) => {
        const next = new Set(prev);
        for (const id of newlyAdded) next.add(id);
        return next;
      });
    }
    seenIds.current = new Set(currentIds);
  }, [currentIds.join(',')]); // intentional: join to detect any change

  return {
    isOpen: (id: string) => openSet.has(id),
    toggle: (id: string) =>
      setOpenSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    open: (id: string) =>
      setOpenSet((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      }),
  };
}
