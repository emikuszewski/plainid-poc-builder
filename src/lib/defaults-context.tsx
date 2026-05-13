import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  listTrackerTasks,
  listResponsibilities,
  listAdminPersonas,
  listAdminReferenceDocs,
  listAdminSprints,
  listAdminBoilerplate,
  listAdminSystemCatalog,
  listAdminIdentityProviders,
  bootstrapAdminDefaults,
} from './admin-defaults';
import {
  DEFAULT_TRACKER,
  DEFAULT_PERSONAS,
  DEFAULT_SPRINTS,
  DEFAULT_REFERENCE_DOCS,
} from './seed-data';
import {
  SYSTEM_CATALOG,
  IDENTITY_PROVIDER_CATALOG,
} from '../types';
import type {
  AdminDefaultTrackerTask,
  AdminDefaultResponsibility,
  AdminDefaultPersona,
  AdminDefaultReferenceDoc,
  AdminDefaultSprint,
  AdminDefaultBoilerplate,
  AdminDefaultSystemCatalogEntry,
  AdminDefaultIdentityProviderEntry,
  TrackerRow,
  Persona,
  Sprint,
  ReferenceDoc,
  SystemCatalogEntry,
  IdentityProviderCatalogEntry,
  UseCaseCategory,
  IdpProviderType,
} from '../types';

/**
 * DefaultsContext — central registry of admin-curated defaults.
 *
 * Loaded once when the app boots; consumers (PocEditor.emptyPoc, admin tabs)
 * read from here. When a tab is empty in the database (e.g. first run after
 * deploying admin defaults), the context falls back to the hardcoded seeds
 * from seed-data.ts so the app continues to work.
 *
 * Each admin tab can call `refresh()` after a write to re-pull its catalog
 * (or refresh() with no args to reload everything).
 */

export interface DefaultsState {
  tracker: AdminDefaultTrackerTask[];
  responsibilities: AdminDefaultResponsibility[];
  personas: AdminDefaultPersona[];
  referenceDocs: AdminDefaultReferenceDoc[];
  sprints: AdminDefaultSprint[];
  boilerplate: AdminDefaultBoilerplate[];
  systemCatalog: AdminDefaultSystemCatalogEntry[];
  identityProviders: AdminDefaultIdentityProviderEntry[];
  loaded: boolean;
  refresh: (key?: keyof DefaultsCatalogs) => Promise<void>;
}

// Just the catalog keys (no loaded/refresh) — useful elsewhere.
export interface DefaultsCatalogs {
  tracker: AdminDefaultTrackerTask[];
  responsibilities: AdminDefaultResponsibility[];
  personas: AdminDefaultPersona[];
  referenceDocs: AdminDefaultReferenceDoc[];
  sprints: AdminDefaultSprint[];
  boilerplate: AdminDefaultBoilerplate[];
  systemCatalog: AdminDefaultSystemCatalogEntry[];
  identityProviders: AdminDefaultIdentityProviderEntry[];
}

const initialState: DefaultsCatalogs = {
  tracker: [],
  responsibilities: [],
  personas: [],
  referenceDocs: [],
  sprints: [],
  boilerplate: [],
  systemCatalog: [],
  identityProviders: [],
};

const DefaultsContext = createContext<DefaultsState>({
  ...initialState,
  loaded: false,
  refresh: async () => {},
});

export function DefaultsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DefaultsCatalogs>(initialState);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async (key?: keyof DefaultsCatalogs) => {
    try {
      const tasks: Array<keyof DefaultsCatalogs> = key
        ? [key]
        : [
            'tracker',
            'responsibilities',
            'personas',
            'referenceDocs',
            'sprints',
            'boilerplate',
            'systemCatalog',
            'identityProviders',
          ];
      const partial: Partial<DefaultsCatalogs> = {};
      await Promise.all(
        tasks.map(async (k) => {
          switch (k) {
            case 'tracker':
              partial.tracker = await listTrackerTasks();
              break;
            case 'responsibilities':
              partial.responsibilities = await listResponsibilities();
              break;
            case 'personas':
              partial.personas = await listAdminPersonas();
              break;
            case 'referenceDocs':
              partial.referenceDocs = await listAdminReferenceDocs();
              break;
            case 'sprints':
              partial.sprints = await listAdminSprints();
              break;
            case 'boilerplate':
              partial.boilerplate = await listAdminBoilerplate();
              break;
            case 'systemCatalog':
              partial.systemCatalog = await listAdminSystemCatalog();
              break;
            case 'identityProviders':
              partial.identityProviders = await listAdminIdentityProviders();
              break;
          }
        }),
      );
      setState((prev) => ({ ...prev, ...partial }));
    } catch (err) {
      // Errors during initial load are non-fatal — consumers fall back to
      // hardcoded seed data when admin tables are empty. Log for visibility.
      // eslint-disable-next-line no-console
      console.warn('DefaultsContext refresh failed', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // On mount: run bootstrap first (idempotent — no-op once tables have
    // data), then refresh all catalogs from the database. This sequence
    // ensures the very first time the app boots after the admin feature
    // ships, the user sees their team's defaults populated rather than
    // an empty admin console.
    let cancelled = false;
    (async () => {
      try {
        await bootstrapAdminDefaults();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Admin defaults bootstrap failed', err);
      }
      if (!cancelled) {
        await refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return (
    <DefaultsContext.Provider value={{ ...state, loaded, refresh }}>
      {children}
    </DefaultsContext.Provider>
  );
}

export function useDefaults(): DefaultsState {
  return useContext(DefaultsContext);
}

// ============================================================
// Helpers to project admin defaults into POC-shaped rows.
//
// These functions take the live admin catalog (which may be empty)
// and fall back to hardcoded seeds. They're the bridge between admin
// content and the POC editor: emptyPoc() calls these to seed a new POC.
// ============================================================

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

export function projectTracker(admin: AdminDefaultTrackerTask[]): TrackerRow[] {
  if (admin.length === 0) {
    return DEFAULT_TRACKER.map((t) => ({ ...t, id: uid() }));
  }
  return admin.map((t) => ({
    id: uid(),
    phase: t.phase,
    task: t.task,
    responsible: t.responsible ?? '',
    status: (t.defaultStatus as TrackerRow['status']) ?? 'Not Started',
    dueDate: '',
  }));
}

export function projectPersonas(admin: AdminDefaultPersona[]): Persona[] {
  if (admin.length === 0) {
    return DEFAULT_PERSONAS.map((p) => ({ ...p, id: uid() }));
  }
  return admin.map((p) => ({
    id: uid(),
    name: p.name,
    description: p.description ?? '',
  }));
}

export function projectSprints(admin: AdminDefaultSprint[]): Sprint[] {
  if (admin.length === 0) {
    return DEFAULT_SPRINTS.map((s) => ({ ...s, id: uid() }));
  }
  // The Sprint shape in PocDocument is { id, phase, weeks, focus }. The
  // admin row's `name` field maps to `phase` (it's the human label for
  // the sprint slot). `deliverables` exists on the admin row for future
  // use but isn't part of the POC sprint shape yet.
  return admin.map((s) => ({
    id: uid(),
    phase: s.name,
    weeks: s.weeks ?? '',
    focus: s.focus ?? '',
  }));
}

export function projectReferenceDocs(admin: AdminDefaultReferenceDoc[]): ReferenceDoc[] {
  if (admin.length === 0) {
    return DEFAULT_REFERENCE_DOCS.map((d) => ({ ...d, id: uid() }));
  }
  return admin.map((d) => ({
    id: uid(),
    title: d.title,
    url: d.url,
    description: d.description ?? '',
  }));
}

export function projectResponsibilities(
  admin: AdminDefaultResponsibility[],
  kind: 'customer' | 'plainid',
): string {
  // Responsibilities are stored on PocDocument as a single newline-separated
  // string. Project the admin rows for the requested kind into that shape.
  return admin
    .filter((r) => r.kind === kind)
    .map((r) => r.text)
    .join('\n');
}

export function projectBoilerplate(
  admin: AdminDefaultBoilerplate[],
  key: string,
  fallback: string,
): string {
  const row = admin.find((r) => r.key === key);
  return row?.value ?? fallback;
}

/**
 * Pull all three tenant-strategy template strings out of the boilerplate
 * catalog and return them as a map keyed by choice ('customer' / 'plainid'
 * / 'other'). Used by Sections.tsx to pass into tenantStrategyDefault().
 * Templates use `{{customer}}` placeholders that the caller substitutes.
 */
export function projectTenantStrategyTemplates(
  admin: AdminDefaultBoilerplate[],
): Partial<Record<'customer' | 'plainid' | 'other', string>> {
  const out: Partial<Record<'customer' | 'plainid' | 'other', string>> = {};
  for (const choice of ['customer', 'plainid', 'other'] as const) {
    const row = admin.find((r) => r.key === `tenantStrategy.${choice}`);
    if (row && typeof row.value === 'string') {
      out[choice] = row.value;
    }
  }
  return out;
}

/**
 * Project the admin system catalog into the SystemCatalogEntry shape the
 * Discovery picker expects. Falls back to the hardcoded SYSTEM_CATALOG
 * when the admin table is empty.
 */
export function projectSystemCatalog(
  admin: AdminDefaultSystemCatalogEntry[],
): SystemCatalogEntry[] {
  if (admin.length === 0) return SYSTEM_CATALOG;
  return admin.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category as UseCaseCategory,
    authorizerId: s.authorizerId,
    defaultFocus: s.defaultFocus,
  }));
}

/**
 * Project the admin identity provider catalog into the
 * IdentityProviderCatalogEntry shape the Discovery picker expects.
 * Falls back to the hardcoded IDENTITY_PROVIDER_CATALOG when the admin
 * table is empty.
 */
export function projectIdentityProviders(
  admin: AdminDefaultIdentityProviderEntry[],
): IdentityProviderCatalogEntry[] {
  if (admin.length === 0) return IDENTITY_PROVIDER_CATALOG;
  return admin.map((e) => ({
    id: e.id,
    name: e.name,
    providerType: e.providerType as IdpProviderType,
    defaultType: e.defaultType,
    defaultNotes: e.defaultNotes,
  }));
}
