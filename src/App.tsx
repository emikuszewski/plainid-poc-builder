import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Authenticator, ThemeProvider, defaultDarkModeOverride } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { Layout } from './components/Layout';
import { PocList } from './components/PocList';
import { PocEditor } from './components/PocEditor';
import { PocPreview } from './components/PocPreview';
import { UseCaseLibrary } from './components/UseCaseLibrary';
import { AdminPage } from './components/AdminPage';
import { DefaultsProvider } from './lib/defaults-context';
import { listLibrary, createLibraryEntry } from './lib/client';
import { SEED_USE_CASES } from './lib/seed-data';
import { useTheme } from './lib/theme';

const amplifyTheme = {
  name: 'plainid',
  overrides: [defaultDarkModeOverride],
};

/**
 * On first load by any user, if the library is empty, seed it from the
 * SEED_USE_CASES list. This is idempotent — once any entries exist, this
 * is a no-op. It's a reasonable bootstrap mechanism for an internal team tool.
 */
function useLibraryBootstrap(authenticated: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await listLibrary();
        if (existing.length === 0) {
          for (const entry of SEED_USE_CASES) {
            if (cancelled) return;
            try {
              await createLibraryEntry({ ...entry });
            } catch (e) {
              console.warn('Failed to seed library entry', entry.title, e);
            }
          }
        }
      } catch (e) {
        console.warn('Library bootstrap check failed', e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);
  return ready;
}

function AppRoutes({ user }: { user: { email: string } }) {
  useLibraryBootstrap(true);
  return (
    <DefaultsProvider>
      <Layout user={user}>
        <Routes>
          <Route path="/" element={<PocList currentUserEmail={user.email} />} />
          <Route path="/poc/new" element={<PocEditor currentUserEmail={user.email} />} />
          <Route path="/poc/:id" element={<PocEditor currentUserEmail={user.email} />} />
          <Route path="/poc/:id/preview" element={<PocPreview />} />
          <Route path="/library" element={<UseCaseLibrary currentUserEmail={user.email} />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/:tab" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </DefaultsProvider>
  );
}

export default function App() {
  const { theme } = useTheme();
  return (
    <ThemeProvider theme={amplifyTheme} colorMode={theme}>
      <Authenticator
        signUpAttributes={['email']}
        components={{
          Header() {
            return (
              <div style={{ textAlign: 'center', padding: '32px 0 16px' }}>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  PLAINID · POC BUILDER
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-dim)',
                    marginTop: 6,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  @plainid.com only
                </div>
              </div>
            );
          },
        }}
      >
        {({ user, signOut }) => {
          const email =
            (user as any)?.signInDetails?.loginId ??
            (user as any)?.username ??
            'unknown@plainid.com';
          if (!user) {
            return <div>Loading…</div>;
          }
          return <AppRoutes user={{ email }} />;
        }}
      </Authenticator>
    </ThemeProvider>
  );
}
