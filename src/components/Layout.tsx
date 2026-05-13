import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import { Button } from './ui/Primitives';
import { useTheme } from '../lib/theme';

export function Layout({ user, children }: { user: { email: string }; children: React.ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { theme, toggle } = useTheme();

  const navLinks = [
    { to: '/', label: 'POCs' },
    { to: '/library', label: 'Use Case Library' },
    { to: '/admin', label: 'Admin' },
  ];

  const isActive = (to: string) =>
    to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
        <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" fill="var(--color-bg)" stroke="var(--color-border-strong)" />
              <path
                d="M9 8h7.5a6 6 0 0 1 0 12H13v4H9V8zm4 8.5h3a2.5 2.5 0 0 0 0-5h-3v5z"
                fill="var(--color-accent)"
              />
            </svg>
            <span className="font-semibold text-[13px] tracking-tight">
              PlainID
              <span className="text-[var(--color-text-dim)] font-normal mx-1.5">/</span>
              <span className="text-[var(--color-text-muted)] font-normal">POC Builder</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-2.5 py-1 rounded text-[12.5px] transition-colors ${
                  isActive(l.to)
                    ? 'text-[var(--color-text)] bg-[var(--color-bg-elevated)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="h-7 w-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-elevated)] transition-colors"
            >
              {theme === 'dark' ? (
                // Sun icon — visible in dark mode (action: switch to light)
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                // Moon icon — visible in light mode (action: switch to dark)
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <span className="mono text-[11px] text-[var(--color-text-dim)]">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                nav('/');
                window.location.reload();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
