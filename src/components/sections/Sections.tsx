import React, { useEffect, useRef, useState } from 'react';
import type {
  PocDocument,
  InScopeSystem,
  IdentitySource,
  Sprint,
  Persona,
  TeamMember,
  UseCase,
  TrackerRow,
  ReferenceDoc,
  UseCaseLibraryEntry,
  SystemCatalogEntry,
  UseCaseCategory,
  IdentityProviderCatalogEntry,
  IdpProviderType,
  PlainIdTeamCatalogEntry,
} from '../../types';
import {
  Field,
  Button,
  SectionCard,
  Pill,
  EmptyState,
  Modal,
  CollapsibleCard,
  useExpandedSet,
} from '../ui/Primitives';
import { AiButton } from '../ui/AiButton';
import { evaluateSection } from '../../lib/completeness';
import { summarizeSection } from '../../lib/section-summaries';
import { emptyTechnicalSpec, reshapeTechnicalSpec } from '../../lib/technical-spec';
import { generate } from '../../lib/ai';
import { buildFieldSuggestPrompt, FIELD_PROMPTS } from '../../lib/ai-prompts';
import { tenantStrategyDefault } from '../../lib/seed-data';
import type { TenantStrategyChoice } from '../../lib/seed-data';
import {
  useDefaults,
  projectTenantStrategyTemplates,
  projectSystemCatalog,
  projectIdentityProviders,
  projectPlainIdTeam,
} from '../../lib/defaults-context';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

interface SectionProps {
  poc: PocDocument;
  set: (patch: Partial<PocDocument>) => void;
  /**
   * The id of the first section whose required fields aren't all
   * satisfied. The matching section auto-opens; others start collapsed.
   * Computed once by PocEditor on mount.
   */
  firstIncompleteId?: string | null;
}

const status = (poc: PocDocument, id: string) => evaluateSection(poc, id);

/**
 * Hook for a field's "✨ Suggest" button. Returns a render-ready AiButton
 * component plus a loading flag. The button calls aiGenerate with the
 * field's prompt template and writes the result into the named field.
 */
function useFieldSuggest(
  fieldKey: keyof typeof FIELD_PROMPTS,
  poc: PocDocument,
  set: (patch: Partial<PocDocument>) => void,
  pocId?: string,
) {
  const [loading, setLoading] = useState(false);
  const onRun = async () => {
    const built = buildFieldSuggestPrompt(fieldKey, poc, (poc as any)[fieldKey] ?? '');
    if (!built) return;
    setLoading(true);
    try {
      const result = await generate({
        prompt: built.prompt,
        system: built.system,
        maxTokens: built.maxTokens,
        modelId: built.modelId,
        feature: 'field-suggest',
        pocId,
      });
      set({ [fieldKey]: result.text } as Partial<PocDocument>);
    } catch (err: any) {
      alert(`AI suggestion failed: ${err?.message ?? err}`);
    } finally {
      setLoading(false);
    }
  };
  return { loading, button: <AiButton onRun={onRun} loading={loading} /> };
}

/**
 * Focus management for "+ Add" actions on long lists.
 *
 * When a list grows (by length), focuses the input or textarea attached to
 * `lastItemRef`. The element should be the first editable field of the
 * newly-appended item. The browser auto-scrolls the focused element into
 * view, which doubles as visual confirmation that the row was added.
 *
 * Usage:
 *   const ref = useFocusOnAppend(items.length);
 *   ...
 *   {items.map((item, i) => (
 *     <input ref={i === items.length - 1 ? ref : undefined} ... />
 *   ))}
 *
 * The first render is a no-op (we only focus on growth, not initial mount),
 * so existing data doesn't grab focus when a POC opens.
 */
function useFocusOnAppend(length: number) {
  const ref = useRef<HTMLInputElement | null>(null);
  const previousLength = useRef(length);
  useEffect(() => {
    if (length > previousLength.current && ref.current) {
      // Defer to next frame so the new node has rendered with the ref attached.
      requestAnimationFrame(() => {
        ref.current?.focus({ preventScroll: false });
      });
    }
    previousLength.current = length;
  }, [length]);
  return ref;
}

// ============================================================
// 01 — Customer
// ============================================================
export function CustomerSection({ poc, set, firstIncompleteId }: SectionProps) {
  const overviewSuggest = useFieldSuggest('customerOverview', poc, set, poc.id);
  return (
    <SectionCard
      id="customer"
      number="01"
      title="Customer"
      description="The basics. The customer name interpolates into the PlainID Overview prose and several headings."
      status={status(poc, 'customer')}
      summary={summarizeSection(poc, 'customer')}
      defaultOpen={firstIncompleteId === 'customer'}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Customer name" required>
          <input
            type="text"
            value={poc.customerName}
            onChange={(e) => set({ customerName: e.target.value })}
            placeholder="e.g. Texas Instruments"
          />
        </Field>
        <Field label="Industry" required>
          <input
            type="text"
            value={poc.customerIndustry}
            onChange={(e) => set({ customerIndustry: e.target.value })}
            placeholder="e.g. Semiconductor / Manufacturing"
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[
              'Banking',
              'Insurance',
              'Healthcare',
              'Telco',
              'Manufacturing',
              'Retail',
              'Government',
              'Energy',
              'Tech / SaaS',
            ].map((industry) => (
              <button
                key={industry}
                type="button"
                onClick={() => set({ customerIndustry: industry })}
                className={`text-[10.5px] px-1.5 py-0.5 rounded border transition-colors ${
                  poc.customerIndustry === industry
                    ? 'bg-[var(--color-pill-accent-bg)] text-[var(--color-accent)] border-[var(--color-pill-accent-border)]'
                    : 'bg-transparent text-[var(--color-text-dim)] border-[var(--color-border)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)]'
                }`}
              >
                {industry}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Headquarters" className="md:col-span-2">
          <input
            type="text"
            value={poc.customerHQ}
            onChange={(e) => set({ customerHQ: e.target.value })}
            placeholder="e.g. Dallas, Texas"
          />
        </Field>
      </div>
      <Field
        label="Customer overview"
        required
        hint="2-4 sentences. Who they are, scale, what they do, why authorization matters now. Aim for ~80–250 words."
        action={overviewSuggest.button}
      >
        <textarea
          rows={6}
          value={poc.customerOverview}
          onChange={(e) => set({ customerOverview: e.target.value })}
          placeholder="Texas Instruments is a global semiconductor and electronics company headquartered in Dallas, Texas..."
        />
      </Field>
    </SectionCard>
  );
}

// ============================================================
// 02 — Compelling Event / Authorization Context
// ============================================================
export function ContextSection({ poc, set, firstIncompleteId }: SectionProps) {
  const compellingSuggest = useFieldSuggest('compellingEvent', poc, set, poc.id);
  const authContextSuggest = useFieldSuggest('authorizationContext', poc, set, poc.id);
  return (
    <SectionCard
      id="context"
      number="02"
      title="Compelling Event"
      description="The why-now. If this section is hand-wavy, the POC isn't qualified. Name the trigger: a go-live, a regulatory deadline, a migration, a security incident, an audit finding."
      status={status(poc, 'context')}
      summary={summarizeSection(poc, 'context')}
      defaultOpen={firstIncompleteId === 'context'}
    >
      <Field
        label="Compelling event"
        required
        hint="What forces a decision in the next 90–180 days? Be specific about timing."
        action={compellingSuggest.button}
      >
        <textarea
          rows={4}
          value={poc.compellingEvent}
          onChange={(e) => set({ compellingEvent: e.target.value })}
          placeholder="The customer is going live with new data solutions spanning Databricks and Denodo this quarter, surfacing the need to..."
        />
      </Field>
      <Field
        label="Authorization context"
        required
        hint="Bullet points (one per line) describing the current state and what needs to change."
        action={authContextSuggest.button}
      >
        <textarea
          rows={6}
          value={poc.authorizationContext}
          onChange={(e) => set({ authorizationContext: e.target.value })}
          placeholder={`Consolidate fragmented role definitions across systems and identity stores
Convert identity-based access models into dynamic, policy-driven authorization
Provide a unified enforcement layer for the data layer, API gateway, and applications`}
        />
      </Field>
    </SectionCard>
  );
}

// ============================================================
// 03 — Objectives & Outcomes
// ============================================================
export function ObjectivesSection({ poc, set, firstIncompleteId }: SectionProps) {
  const objSuggest = useFieldSuggest('objectives', poc, set, poc.id);
  const validateSuggest = useFieldSuggest('whatToValidate', poc, set, poc.id);
  const deliverSuggest = useFieldSuggest('postPocDeliverables', poc, set, poc.id);
  return (
    <SectionCard
      id="objectives"
      number="03"
      title="Objectives & Outcomes"
      description="The contract. What does success look like, and what does PlainID owe the customer at the end?"
      status={status(poc, 'objectives')}
      summary={summarizeSection(poc, 'objectives')}
      defaultOpen={firstIncompleteId === 'objectives'}
    >
      <Field label="Overall objective" required action={objSuggest.button}>
        <textarea
          rows={3}
          value={poc.objectives}
          onChange={(e) => set({ objectives: e.target.value })}
          placeholder="The objective of this Proof of Concept is to assess the customer's authorization requirements and validate PlainID's ability to deliver PBAC capabilities..."
        />
      </Field>
      <Field
        label="What the customer will validate"
        required
        hint="One bullet per line."
        action={validateSuggest.button}
      >
        <textarea
          rows={6}
          value={poc.whatToValidate}
          onChange={(e) => set({ whatToValidate: e.target.value })}
          placeholder={`PlainID's ability to serve as the central authorization decision engine for...
Integration patterns for the customer's IdP, IGA, AD, LDAP as identity and attribute sources
Role consolidation mechanics — how legacy roles map into policies`}
        />
      </Field>
      <Field
        label="Post-POC deliverables from PlainID"
        required
        hint="One bullet per line."
        action={deliverSuggest.button}
      >
        <textarea
          rows={5}
          value={poc.postPocDeliverables}
          onChange={(e) => set({ postPocDeliverables: e.target.value })}
        />
      </Field>
    </SectionCard>
  );
}

// ============================================================
// 04 — Discovery Summary
// ============================================================

/**
 * EmphasisCard — a tinted wrapper that draws the eye to high-signal
 * subsections inside Discovery (Tenant Strategy, In-scope Systems,
 * Identity Providers). These three blocks drive contractual and
 * architectural decisions, so they should stand out from the
 * surrounding bullet-list fields.
 *
 * Visual treatment: 3px accent left border, tinted background, a small
 * monospaced eyebrow label, and a thin bottom border. POC-editor only —
 * the customer-facing HTML preview is unchanged.
 */
function EmphasisCard({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mb-6 rounded-md border border-[var(--color-pill-accent-border)] bg-[var(--color-pill-accent-bg)] border-l-[3px] border-l-[var(--color-accent)] px-4 py-3"
    >
      <div className="mono text-[10px] tracking-widest text-[var(--color-accent)] mb-2 font-medium">
        {eyebrow}
      </div>
      {children}
    </div>
  );
}

export function DiscoverySection({ poc, set, firstIncompleteId }: SectionProps) {
  const archSuggest = useFieldSuggest('architectureConstraints', poc, set, poc.id);
  const [systemPickerOpen, setSystemPickerOpen] = useState(false);
  const [systemFilter, setSystemFilter] = useState('');
  const systemFocusRef = useFocusOnAppend(poc.inScopeSystems.length);
  const identityFocusRef = useFocusOnAppend(poc.identitySources.length);

  // Tenant strategy templates come from the admin boilerplate catalog;
  // tenantStrategyDefault() substitutes `{{customer}}` placeholders.
  const defaults = useDefaults();
  const tenantTemplates = projectTenantStrategyTemplates(defaults.boilerplate);
  // System & IdP catalogs flow through here so the pickers stay editable
  // from the Admin console. Each falls back to its hardcoded baseline when
  // its admin table is empty.
  const systemCatalog = projectSystemCatalog(defaults.systemCatalog);
  const identityProviderCatalog = projectIdentityProviders(defaults.identityProviders);

  // Collapsible card state — new rows auto-open, existing rows open on click.
  const systemsExpanded = useExpandedSet(poc.inScopeSystems.map((s) => s.id));
  const idpsExpanded = useExpandedSet(poc.identitySources.map((s) => s.id));

  // Blank-row fallback for fully custom in-scope systems.
  const addSystem = () =>
    set({
      inScopeSystems: [
        ...poc.inScopeSystems,
        { id: uid(), name: '', focus: '', priority: 'P1' as const, authorizerId: null },
      ],
    });

  // Add a row pre-filled from the system catalog. Customer name is
  // interpolated into the default POC focus paragraph at this point;
  // afterwards the focus is just text that the SE can edit freely.
  const addSystemFromCatalog = (entry: SystemCatalogEntry) => {
    const customer = poc.customerName.trim() || 'the customer';
    set({
      inScopeSystems: [
        ...poc.inScopeSystems,
        {
          id: uid(),
          name: entry.name,
          focus: entry.defaultFocus.replace(/\{customer\}/g, customer),
          priority: 'P1' as const,
          authorizerId: entry.authorizerId,
        },
      ],
    });
  };

  const updateSystem = (id: string, patch: Partial<InScopeSystem>) =>
    set({
      inScopeSystems: poc.inScopeSystems.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const removeSystem = (id: string) =>
    set({ inScopeSystems: poc.inScopeSystems.filter((s) => s.id !== id) });

  // Identity provider picker — same shape as the system catalog picker.
  const [idpPickerOpen, setIdpPickerOpen] = useState(false);
  const [idpFilter, setIdpFilter] = useState('');

  const addIdentity = () =>
    set({
      identitySources: [
        ...poc.identitySources,
        { id: uid(), name: '', type: '', notes: '', catalogId: null },
      ],
    });

  const addIdentityFromCatalog = (entry: IdentityProviderCatalogEntry) => {
    set({
      identitySources: [
        ...poc.identitySources,
        {
          id: uid(),
          name: entry.name,
          type: entry.defaultType,
          notes: entry.defaultNotes,
          catalogId: entry.id,
        },
      ],
    });
  };

  const updateIdentity = (id: string, patch: Partial<IdentitySource>) =>
    set({
      identitySources: poc.identitySources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const removeIdentity = (id: string) =>
    set({ identitySources: poc.identitySources.filter((s) => s.id !== id) });

  return (
    <SectionCard
      id="discovery"
      number="04"
      title="Discovery Summary"
      description="What systems are in scope, the customer's identity stack, and any architecture constraints surfaced during discovery."
      status={status(poc, 'discovery')}
      summary={summarizeSection(poc, 'discovery')}
      defaultOpen={firstIncompleteId === 'discovery'}
    >
      <EmphasisCard eyebrow="DECISION — TENANT STRATEGY">
        <label className="mb-1.5">Tenant strategy</label>
        <div className="flex flex-col gap-1.5 mb-2">
          {([
            {
              key: 'customer' as const,
              label: "Customer's existing PlainID tenant",
              caveat: 'PlainID has full access — work proceeds asynchronously between sessions',
            },
            {
              key: 'plainid' as const,
              label: 'PlainID-provisioned tenant for the customer',
              caveat: 'PlainID has no access — sessions are customer-driven via screenshare',
            },
            {
              key: 'other' as const,
              label: 'Something else',
              caveat: 'Free-form description below',
            },
          ]).map((opt) => {
            const selected = poc.tenantStrategyChoice === opt.key;
            return (
              <label
                key={opt.key}
                className={`flex items-start gap-2.5 p-2.5 rounded-md cursor-pointer border transition-colors ${
                  selected
                    ? 'bg-[var(--color-pill-accent-bg)] border-[var(--color-pill-accent-border)]'
                    : 'bg-transparent border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                }`}
              >
                <input
                  type="radio"
                  name="tenant-strategy"
                  className="mt-0.5"
                  checked={selected}
                  onChange={() => {
                    // Smart swap: only overwrite the textarea if its current
                    // contents match the previous choice's default verbatim.
                    // SE edits are preserved.
                    const previousDefault = tenantStrategyDefault(
                      poc.tenantStrategyChoice as TenantStrategyChoice,
                      poc.customerName,
                      tenantTemplates,
                    );
                    const isUntouched =
                      poc.tenantStrategy.trim() === previousDefault.trim();
                    const nextText = isUntouched
                      ? tenantStrategyDefault(opt.key, poc.customerName, tenantTemplates)
                      : poc.tenantStrategy;
                    set({
                      tenantStrategyChoice: opt.key,
                      tenantStrategy: nextText,
                    });
                  }}
                />
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-[var(--color-text)]">
                    {opt.label}
                  </div>
                  <div className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
                    {opt.caveat}
                  </div>
                  {/* High-prominence callout: appears only inside the
                      PlainID-provisioned radio when it's selected.
                      Solid accent background + white text — meant to
                      catch the SE's eye every time, not blend in. */}
                  {opt.key === 'plainid' && selected && (
                    <div
                      className="mt-2.5 flex items-start gap-2.5 px-3 py-2.5 rounded-md"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: '#ffffff',
                      }}
                      onClick={(e) => e.preventDefault()}
                    >
                      <span className="text-[15px] leading-none mt-0.5" aria-hidden>
                        📋
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold">
                          Action required: submit the tenant request form
                        </div>
                        <div
                          className="text-[11.5px] mt-0.5 leading-snug"
                          style={{ color: 'rgba(255,255,255,0.85)' }}
                        >
                          PlainID-provisioned tenants are spun up via this internal
                          request form. Submit it to start the process — turnaround is
                          typically a few business days.
                        </div>
                        <a
                          href="https://docs.google.com/forms/d/e/1FAIpQLSfncyH7xfSjCTgkm_q34yYTlivCY35AERdAYCtIqWcD58IioQ/viewform?gxids=7628"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-block mt-2 text-[12px] font-semibold underline"
                          style={{ color: '#ffffff' }}
                        >
                          Open request form →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
        {poc.tenantStrategyChoice && (
          <textarea
            rows={4}
            value={poc.tenantStrategy}
            onChange={(e) => set({ tenantStrategy: e.target.value })}
            placeholder={
              poc.tenantStrategyChoice === 'other'
                ? 'Describe the tenant arrangement and access model for this engagement.'
                : ''
            }
          />
        )}
      </EmphasisCard>

      <EmphasisCard eyebrow="DECISION — IN-SCOPE SYSTEMS">
        <div className="flex items-center justify-between mb-2">
          <label>In-scope systems &amp; platforms</label>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setSystemPickerOpen(true)}>
              + Pick from catalog
            </Button>
            <Button size="sm" variant="ghost" onClick={addSystem}>
              + Custom
            </Button>
          </div>
        </div>
        {poc.inScopeSystems.length === 0 && (
          <EmptyState
            title="No systems yet"
            description="Add the platforms in scope for this POC (Databricks, Apigee, Snowflake, Oracle HCM, etc.) along with their priority tier."
          />
        )}
        <div className="space-y-2">
          {poc.inScopeSystems.map((s, idx) => {
            const isLast = idx === poc.inScopeSystems.length - 1;
            return (
              <CollapsibleCard
                key={s.id}
                expanded={systemsExpanded.isOpen(s.id)}
                onToggle={() => systemsExpanded.toggle(s.id)}
                header={
                  <>
                    <span className="text-[13px] truncate">
                      {s.name || <span className="text-[var(--color-text-dim)]">Untitled system</span>}
                    </span>
                    <Pill tone={s.priority === 'P1' ? 'accent' : 'neutral'}>{s.priority}</Pill>
                    <span className="ml-auto flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSystem(s.id);
                        }}
                        title="Remove"
                      >
                        ×
                      </Button>
                    </span>
                  </>
                }
              >
                <div className="grid grid-cols-12 gap-2 mt-2">
                  <div className="col-span-9">
                    <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                      Name
                    </label>
                    <input
                      ref={isLast ? systemFocusRef : undefined}
                      placeholder="System name"
                      value={s.name}
                      onChange={(e) => updateSystem(s.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                      Priority
                    </label>
                    <select
                      value={s.priority}
                      onChange={(e) =>
                        updateSystem(s.id, {
                          priority: e.target.value as InScopeSystem['priority'],
                        })
                      }
                    >
                      <option value="P1">P1</option>
                      <option value="P2">P2</option>
                      <option value="P3">P3</option>
                    </select>
                  </div>
                  <div className="col-span-12 mt-2">
                    <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                      POC focus
                    </label>
                    <textarea
                      rows={4}
                      placeholder="What we're doing with this system in the POC."
                      value={s.focus}
                      onChange={(e) => updateSystem(s.id, { focus: e.target.value })}
                    />
                  </div>
                </div>
              </CollapsibleCard>
            );
          })}
        </div>
      </EmphasisCard>

      <EmphasisCard eyebrow="DECISION — IDENTITY PROVIDERS">
        <div className="flex items-center justify-between mb-2">
          <label>Identity Providers</label>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setIdpPickerOpen(true)}>
              + Pick from catalog
            </Button>
            <Button size="sm" variant="ghost" onClick={addIdentity}>
              + Custom
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {poc.identitySources.map((s, idx) => {
            const isLast = idx === poc.identitySources.length - 1;
            return (
              <CollapsibleCard
                key={s.id}
                expanded={idpsExpanded.isOpen(s.id)}
                onToggle={() => idpsExpanded.toggle(s.id)}
                header={
                  <>
                    <span className="text-[13px] truncate">
                      {s.name || <span className="text-[var(--color-text-dim)]">Unnamed</span>}
                    </span>
                    {s.type && <Pill>{s.type}</Pill>}
                    <span className="ml-auto flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeIdentity(s.id);
                        }}
                      >
                        ×
                      </Button>
                    </span>
                  </>
                }
              >
                <div className="grid grid-cols-12 gap-2 mt-2">
                  <div className="col-span-6">
                    <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                      Name
                    </label>
                    <input
                      ref={isLast ? identityFocusRef : undefined}
                      placeholder="e.g. Ping Identity"
                      value={s.name}
                      onChange={(e) => updateIdentity(s.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="col-span-6">
                    <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                      Type
                    </label>
                    <input
                      placeholder="e.g. Primary IdP"
                      value={s.type}
                      onChange={(e) => updateIdentity(s.id, { type: e.target.value })}
                    />
                  </div>
                  <div className="col-span-12 mt-2">
                    <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                      Notes
                    </label>
                    <textarea
                      rows={3}
                      value={s.notes}
                      onChange={(e) => updateIdentity(s.id, { notes: e.target.value })}
                    />
                  </div>
                </div>
              </CollapsibleCard>
            );
          })}
        </div>
      </EmphasisCard>

      <Field
        label="Architecture constraints & design decisions"
        hint="One bullet per line."
        action={archSuggest.button}
      >
        <textarea
          rows={5}
          value={poc.architectureConstraints}
          onChange={(e) => set({ architectureConstraints: e.target.value })}
          placeholder={`No microservices architecture — enforcement at data layer and API gateway tier
Kubernetes hosting — components deployed via Helm chart
Data layer is the primary focus`}
        />
      </Field>

      <Field
        label="Out of scope"
        hint="One bullet per line. Things explicitly excluded from this POC — call them out so they don't leak into expectations."
      >
        <textarea
          rows={5}
          value={poc.outOfScope}
          onChange={(e) => set({ outOfScope: e.target.value })}
          placeholder={`Denodo — qualified out during scope alignment
Native SQL client integration — production pattern documented but not validated
Agentic AI use cases — tracked separately`}
        />
      </Field>

      {/* System catalog picker */}
      <Modal
        open={systemPickerOpen}
        onClose={() => {
          setSystemPickerOpen(false);
          setSystemFilter('');
        }}
        title="Pick a system to add"
        width={760}
      >
        <p className="text-[12.5px] text-[var(--color-text-muted)] mb-3 leading-relaxed">
          Each entry pre-fills the row with a default POC focus paragraph
          (editable after) and tracks the matching authorizer for quote and
          use-case workflows.
        </p>
        <Field label="Search">
          <input
            type="text"
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
            placeholder="snowflake, apigee, langchain, …"
            autoFocus
          />
        </Field>
        <div className="mt-3 max-h-[480px] overflow-y-auto pr-1">
          {(['Data', 'API Gateway', 'AI Authorization', 'Application'] as UseCaseCategory[]).map(
            (cat) => {
              const filterLower = systemFilter.trim().toLowerCase();
              const items = systemCatalog.filter(
                (s) =>
                  s.category === cat &&
                  (!filterLower ||
                    s.name.toLowerCase().includes(filterLower) ||
                    s.defaultFocus.toLowerCase().includes(filterLower)),
              );
              if (items.length === 0) return null;
              return (
                <div key={cat} className="mb-4 last:mb-0">
                  <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-1.5">
                    {cat.toUpperCase()}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          addSystemFromCatalog(s);
                          setSystemPickerOpen(false);
                          setSystemFilter('');
                        }}
                        className="text-left p-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] transition-colors"
                      >
                        <div className="text-[12.5px] font-medium text-[var(--color-text)] mb-0.5">
                          {s.name}
                        </div>
                        <div className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 leading-snug">
                          {s.defaultFocus.replace(/\{customer\}/g, poc.customerName.trim() || 'the customer')}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            },
          )}
          {systemCatalog.filter(
            (s) =>
              !systemFilter.trim() ||
              s.name.toLowerCase().includes(systemFilter.trim().toLowerCase()) ||
              s.defaultFocus.toLowerCase().includes(systemFilter.trim().toLowerCase()),
          ).length === 0 && (
            <div className="py-8 text-center text-[12px] text-[var(--color-text-muted)]">
              No systems match — use the Custom button to add a free-form entry.
            </div>
          )}
        </div>
      </Modal>

      {/* Identity Provider catalog picker */}
      <Modal
        open={idpPickerOpen}
        onClose={() => {
          setIdpPickerOpen(false);
          setIdpFilter('');
        }}
        title="Pick an identity provider"
        width={720}
      >
        <p className="text-[12.5px] text-[var(--color-text-muted)] mb-3 leading-relaxed">
          Each entry pre-fills the row with a standard notes paragraph (editable after).
        </p>
        <Field label="Search">
          <input
            type="text"
            value={idpFilter}
            onChange={(e) => setIdpFilter(e.target.value)}
            placeholder="okta, sailpoint, active directory, …"
            autoFocus
          />
        </Field>
        <div className="mt-3 max-h-[480px] overflow-y-auto pr-1">
          {(['Cloud IdP', 'Directory', 'IGA'] as IdpProviderType[]).map((ptype) => {
            const filterLower = idpFilter.trim().toLowerCase();
            const items = identityProviderCatalog.filter(
              (e) =>
                e.providerType === ptype &&
                (!filterLower ||
                  e.name.toLowerCase().includes(filterLower) ||
                  e.defaultNotes.toLowerCase().includes(filterLower)),
            );
            if (items.length === 0) return null;
            return (
              <div key={ptype} className="mb-4 last:mb-0">
                <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-1.5">
                  {ptype === 'Cloud IdP'
                    ? 'CLOUD IDPS'
                    : ptype === 'Directory'
                      ? 'DIRECTORIES'
                      : 'IGA'}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        addIdentityFromCatalog(e);
                        setIdpPickerOpen(false);
                        setIdpFilter('');
                      }}
                      className="text-left p-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                      <div className="text-[12.5px] font-medium text-[var(--color-text)] mb-0.5">
                        {e.name}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 leading-snug">
                        {e.defaultType} — {e.defaultNotes}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {identityProviderCatalog.filter(
            (e) =>
              !idpFilter.trim() ||
              e.name.toLowerCase().includes(idpFilter.trim().toLowerCase()) ||
              e.defaultNotes.toLowerCase().includes(idpFilter.trim().toLowerCase()),
          ).length === 0 && (
            <div className="py-8 text-center text-[12px] text-[var(--color-text-muted)]">
              No identity providers match — use the Custom button to add a free-form entry.
            </div>
          )}
        </div>
      </Modal>
    </SectionCard>
  );
}

// ============================================================
// 05 — Timeline
// ============================================================
export function TimelineSection({ poc, set, firstIncompleteId }: SectionProps) {
  const sprintFocusRef = useFocusOnAppend(poc.sprints.length);
  const addSprint = () =>
    set({
      sprints: [...poc.sprints, { id: uid(), phase: '', weeks: '', focus: '' }],
    });
  const update = (id: string, patch: Partial<Sprint>) =>
    set({ sprints: poc.sprints.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const remove = (id: string) =>
    set({ sprints: poc.sprints.filter((s) => s.id !== id) });

  return (
    <SectionCard
      id="timeline"
      number="07"
      title="Timeline"
      description="High-level timeline summary plus 2-week sprint structure aligned to use-case clusters."
      status={status(poc, 'timeline')}
      summary={summarizeSection(poc, 'timeline')}
      defaultOpen={firstIncompleteId === 'timeline'}
    >
      <Field label="Timeline summary" required>
        <textarea
          rows={3}
          value={poc.timelineSummary}
          onChange={(e) => set({ timelineSummary: e.target.value })}
        />
      </Field>
      <div className="flex items-center justify-between mb-2">
        <label>Sprints</label>
        <Button size="sm" onClick={addSprint}>
          + Add sprint
        </Button>
      </div>
      <div className="space-y-2">
        {poc.sprints.map((s, idx) => (
          <div
            key={s.id}
            className="grid grid-cols-12 gap-2 items-start bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-2"
          >
            <input
              ref={idx === poc.sprints.length - 1 ? sprintFocusRef : undefined}
              className="col-span-2"
              placeholder="Sprint 0"
              value={s.phase}
              onChange={(e) => update(s.id, { phase: e.target.value })}
            />
            <input
              className="col-span-2"
              placeholder="Week 1"
              value={s.weeks}
              onChange={(e) => update(s.id, { weeks: e.target.value })}
            />
            <input
              className="col-span-7"
              placeholder="Focus"
              value={s.focus}
              onChange={(e) => update(s.id, { focus: e.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="col-span-1 justify-center"
              onClick={() => remove(s.id)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ============================================================
// 06 — Framework
// ============================================================
export function FrameworkSection({ poc, set, firstIncompleteId }: SectionProps) {
  const personaFocusRef = useFocusOnAppend(poc.personas.length);

  // Collapsible card state.
  const personasExpanded = useExpandedSet(poc.personas.map((p) => p.id));
  const addPersona = () =>
    set({ personas: [...poc.personas, { id: uid(), name: '', description: '' }] });
  const updatePersona = (id: string, patch: Partial<Persona>) =>
    set({ personas: poc.personas.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const removePersona = (id: string) =>
    set({ personas: poc.personas.filter((p) => p.id !== id) });

  return (
    <SectionCard
      id="framework"
      number="09"
      title="Framework"
      description="Cadence and the test personas used during validation."
      status={status(poc, 'framework')}
      summary={summarizeSection(poc, 'framework')}
      defaultOpen={firstIncompleteId === 'framework'}
    >
      <Field label="Cadence & collaboration model" required>
        <textarea
          rows={4}
          value={poc.cadence}
          onChange={(e) => set({ cadence: e.target.value })}
        />
      </Field>

      <div className="flex items-center justify-between mb-2">
        <label>Test personas</label>
        <Button size="sm" onClick={addPersona}>
          + Add persona
        </Button>
      </div>
      <div className="space-y-2 mb-6">
        {poc.personas.map((p, idx) => {
          const isLast = idx === poc.personas.length - 1;
          return (
            <CollapsibleCard
              key={p.id}
              expanded={personasExpanded.isOpen(p.id)}
              onToggle={() => personasExpanded.toggle(p.id)}
              header={
                <>
                  <span className="text-[13px] truncate">
                    {p.name || <span className="text-[var(--color-text-dim)]">Unnamed persona</span>}
                  </span>
                  {p.description && (
                    <span className="text-[11.5px] text-[var(--color-text-muted)] truncate">
                      — {p.description}
                    </span>
                  )}
                  <span className="ml-auto flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePersona(p.id);
                      }}
                    >
                      ×
                    </Button>
                  </span>
                </>
              }
            >
              <div className="grid grid-cols-12 gap-2 mt-2">
                <div className="col-span-4">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    Name
                  </label>
                  <input
                    ref={isLast ? personaFocusRef : undefined}
                    placeholder="e.g. Data Domain Owner"
                    value={p.name}
                    onChange={(e) => updatePersona(p.id, { name: e.target.value })}
                  />
                </div>
                <div className="col-span-8">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    Description
                  </label>
                  <input
                    placeholder="Brief description of the role"
                    value={p.description}
                    onChange={(e) => updatePersona(p.id, { description: e.target.value })}
                  />
                </div>
              </div>
            </CollapsibleCard>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ============================================================
// 08 — Team
//
// Pulled out of Framework so it stands as its own top-level
// section. Houses both customer-side team members and the
// PlainID team picker.
// ============================================================
export function TeamSection({ poc, set, firstIncompleteId }: SectionProps) {
  const memberFocusRef = useFocusOnAppend(poc.teamMembers.length);
  const membersExpanded = useExpandedSet(poc.teamMembers.map((m) => m.id));
  const [plainidPickerOpen, setPlainidPickerOpen] = useState(false);

  // PlainID team catalog flows through DefaultsContext so it stays editable
  // from the Admin → PlainID Team tab. Falls back to the hardcoded baseline
  // when the admin table is empty.
  const defaults = useDefaults();
  const plainIdTeamCatalog = projectPlainIdTeam(defaults.plainidTeam);

  const addMember = (org: string) =>
    set({
      teamMembers: [
        ...poc.teamMembers,
        { id: uid(), org, name: '', role: '', email: '', catalogId: null },
      ],
    });

  const addMemberFromCatalog = (entry: PlainIdTeamCatalogEntry) => {
    set({
      teamMembers: [
        ...poc.teamMembers,
        {
          id: uid(),
          org: 'PlainID',
          name: entry.name,
          role: entry.defaultRole,
          email: entry.email,
          catalogId: entry.id,
        },
      ],
    });
  };

  const updateMember = (id: string, patch: Partial<TeamMember>) =>
    set({
      teamMembers: poc.teamMembers.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  const removeMember = (id: string) =>
    set({ teamMembers: poc.teamMembers.filter((m) => m.id !== id) });

  return (
    <SectionCard
      id="team"
      number="08"
      title="Team"
      description="The named humans on both sides of the engagement — customer stakeholders plus the assigned PlainID team."
      status={status(poc, 'team')}
      summary={summarizeSection(poc, 'team')}
      defaultOpen={firstIncompleteId === 'team'}
    >
      <div className="flex items-center justify-between mb-2">
        <label>POC team members</label>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => addMember(poc.customerName || 'Customer')}>
            + Customer
          </Button>
          <Button size="sm" onClick={() => setPlainidPickerOpen(true)}>
            + PlainID (pick)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addMember('PlainID')}>
            + PlainID custom
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {poc.teamMembers.map((m, idx) => {
          const isLast = idx === poc.teamMembers.length - 1;
          return (
            <CollapsibleCard
              key={m.id}
              expanded={membersExpanded.isOpen(m.id)}
              onToggle={() => membersExpanded.toggle(m.id)}
              header={
                <>
                  {m.org && <Pill tone={m.org === 'PlainID' ? 'accent' : 'neutral'}>{m.org}</Pill>}
                  <span className="text-[13px] truncate">
                    {m.name || <span className="text-[var(--color-text-dim)]">Unnamed</span>}
                  </span>
                  {m.role && (
                    <span className="text-[11.5px] text-[var(--color-text-muted)] truncate">
                      — {m.role}
                    </span>
                  )}
                  <span className="ml-auto flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMember(m.id);
                      }}
                    >
                      ×
                    </Button>
                  </span>
                </>
              }
            >
              <div className="grid grid-cols-12 gap-2 mt-2">
                <div className="col-span-3">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    Org
                  </label>
                  <input
                    placeholder="Org"
                    value={m.org}
                    onChange={(e) => updateMember(m.id, { org: e.target.value })}
                  />
                </div>
                <div className="col-span-4">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    Name
                  </label>
                  <input
                    ref={isLast ? memberFocusRef : undefined}
                    placeholder="Full name"
                    value={m.name}
                    onChange={(e) => updateMember(m.id, { name: e.target.value })}
                  />
                </div>
                <div className="col-span-5">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    Role
                  </label>
                  <input
                    placeholder="Role"
                    value={m.role}
                    onChange={(e) => updateMember(m.id, { role: e.target.value })}
                  />
                </div>
                <div className="col-span-12 mt-2">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={m.email}
                    onChange={(e) => updateMember(m.id, { email: e.target.value })}
                  />
                </div>
              </div>
            </CollapsibleCard>
          );
        })}
      </div>

      {/* PlainID team picker */}
      <Modal
        open={plainidPickerOpen}
        onClose={() => setPlainidPickerOpen(false)}
        title="Add a PlainID team member"
        width={520}
      >
        <p className="text-[12.5px] text-[var(--color-text-muted)] mb-3 leading-relaxed">
          Name, email, and a default role pre-fill from the catalog. Edit the role on the
          row afterward to reflect responsibility on this specific engagement (e.g.
          add "— POC Lead" to the title).
        </p>
        <div className="space-y-1.5">
          {plainIdTeamCatalog.map((e) => {
            const alreadyAdded = poc.teamMembers.some((m) => m.catalogId === e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  addMemberFromCatalog(e);
                  setPlainidPickerOpen(false);
                }}
                disabled={alreadyAdded}
                className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                  alreadyAdded
                    ? 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-50 cursor-not-allowed'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-medium text-[var(--color-text)]">
                    {e.name}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {e.defaultRole}
                  </span>
                  {alreadyAdded && (
                    <span className="ml-auto text-[10px] mono tracking-wider text-[var(--color-text-dim)]">
                      ALREADY ADDED
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
                  {e.email}
                </div>
              </button>
            );
          })}
        </div>
      </Modal>
    </SectionCard>
  );
}

// ============================================================
// 07 — Use Cases
// ============================================================
export function UseCasesSection({
  poc,
  set,
  firstIncompleteId,
  library,
  onOpenLibraryPicker,
}: SectionProps & {
  library: UseCaseLibraryEntry[];
  onOpenLibraryPicker: () => void;
}) {
  const useCaseFocusRef = useFocusOnAppend(poc.useCases.length);
  const useCasesExpanded = useExpandedSet(poc.useCases.map((u) => u.id));
  const addBlank = () =>
    set({
      useCases: [
        ...poc.useCases,
        {
          id: uid(),
          libraryId: null,
          title: '',
          category: 'Other',
          persona: '',
          objectives: '',
          successCriteria: '',
          technicalSpec: emptyTechnicalSpec('Other'),
        },
      ],
    });
  const update = (id: string, patch: Partial<UseCase>) =>
    set({
      useCases: poc.useCases.map((u) => {
        if (u.id !== id) return u;
        // If category changed, reshape the technical spec to match
        if (patch.category && patch.category !== u.category) {
          return {
            ...u,
            ...patch,
            technicalSpec: reshapeTechnicalSpec(u.technicalSpec, patch.category),
          };
        }
        return { ...u, ...patch };
      }),
    });
  const remove = (id: string) =>
    set({ useCases: poc.useCases.filter((u) => u.id !== id) });
  const move = (id: string, dir: -1 | 1) => {
    const idx = poc.useCases.findIndex((u) => u.id === id);
    const target = idx + dir;
    if (target < 0 || target >= poc.useCases.length) return;
    const next = [...poc.useCases];
    [next[idx], next[target]] = [next[target], next[idx]];
    set({ useCases: next });
  };

  // ---- AI: Generate use cases ----
  // Mirrors the async pattern used by the Review POC button: clicking the
  // toolbar button kicks generation in the background and the icon swaps
  // to a spinner. Clicking again while pending is a no-op (the icon tells
  // the user it's running). When generation completes, the icon goes ✓
  // and the next click opens the modal with the candidates to pick. On
  // error, the icon goes ! and click opens the modal showing the failure
  // with a Re-run button.
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<
    { tempId: string; title: string; category: string; persona: string; objectives: string; successCriteria: string }[]
  >([]);
  const [generatedSelection, setGeneratedSelection] = useState<string[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Tracks whether a completed batch is waiting in `generated` to be viewed.
  // Cleared whenever the user opens the modal or kicks a new run.
  const [generateUnseenComplete, setGenerateUnseenComplete] = useState(false);

  const isValidCategory = (c: string): UseCase['category'] => {
    const valid = [
      'Data',
      'API Gateway',
      'AI Authorization',
      'Identity',
      'Compliance',
      'Application',
      'Other',
    ];
    return (valid.includes(c) ? c : 'Other') as UseCase['category'];
  };

  const runGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setGenerateUnseenComplete(false);
    try {
      const { buildGenerateUseCasesPrompt, parseGeneratedUseCases } = await import(
        '../../lib/ai-prompts'
      );
      const built = buildGenerateUseCasesPrompt(poc, 3);
      const result = await generate({
        prompt: built.prompt,
        system: built.system,
        maxTokens: built.maxTokens,
        modelId: built.modelId,
        feature: 'generate-use-cases',
        pocId: poc.id,
      });
      const parsed = parseGeneratedUseCases(result.text);
      if (parsed.length === 0) {
        setGenerateError('AI returned no usable use cases. Please try again.');
        setGenerated([]);
        setGenerateUnseenComplete(true); // surface error via icon state
      } else {
        const withIds = parsed.map((p) => ({ tempId: uid(), ...p }));
        setGenerated(withIds);
        setGeneratedSelection(withIds.map((p) => p.tempId));
        setGenerateUnseenComplete(true);
      }
    } catch (err: any) {
      setGenerateError(err?.message ?? 'AI generation failed');
      setGenerated([]);
      setGenerateUnseenComplete(true);
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Toolbar button click. State machine:
   *   - Pending  → no-op (icon already shows spinner)
   *   - Idle, no prior result  → kick a run; do NOT open modal
   *   - Has unseen result (complete or error)  → open modal to view it
   *   - Has seen result  → kick a new run; do NOT open modal
   */
  const onGenerateClick = () => {
    if (generating) return;
    if (generateUnseenComplete) {
      // User wants to view the result they were notified of by the icon.
      setGenerateModalOpen(true);
      setGenerateUnseenComplete(false);
      return;
    }
    // Either first run, or user has already seen the previous result and
    // wants to ask for new candidates.
    setGenerated([]);
    setGeneratedSelection([]);
    setGenerateError(null);
    void runGenerate();
  };

  // Icon state mirrors Review's pattern.
  const generateIconState = {
    loading: generating,
    complete: generateUnseenComplete && !generateError && generated.length > 0,
    error: generateUnseenComplete && !!generateError,
  };

  const toggleGeneratedSelection = (tempId: string) =>
    setGeneratedSelection((prev) =>
      prev.includes(tempId) ? prev.filter((x) => x !== tempId) : [...prev, tempId],
    );

  const acceptSelectedGenerated = () => {
    const picks = generatedSelection
      .map((id) => generated.find((g) => g.tempId === id))
      .filter((g): g is NonNullable<typeof g> => !!g);
    if (picks.length === 0) return;
    const newCases: UseCase[] = picks.map((p) => {
      const cat = isValidCategory(p.category);
      return {
        id: uid(),
        libraryId: null,
        title: p.title,
        category: cat,
        persona: p.persona,
        objectives: p.objectives,
        successCriteria: p.successCriteria,
        technicalSpec: emptyTechnicalSpec(cat),
      };
    });
    set({ useCases: [...poc.useCases, ...newCases] });
    setGenerateModalOpen(false);
    setGenerated([]);
    setGeneratedSelection([]);
  };

  return (
    <SectionCard
      id="usecases"
      number="05"
      title="Use Cases"
      description="The meat of the POC. Pick from the library to drop a fully-formed use case in (snapshotted at insertion — library updates won't propagate). Then customize."
      status={status(poc, 'usecases')}
      summary={summarizeSection(poc, 'usecases')}
      defaultOpen={firstIncompleteId === 'usecases'}
    >
      <div className="flex items-center justify-end gap-2 mb-3">
        <AiButton
          label="Generate"
          onRun={onGenerateClick}
          loading={generateIconState.loading}
          complete={generateIconState.complete}
          error={generateIconState.error}
          title={
            generateIconState.loading
              ? 'Use case generation running in the background — icon will turn green when done'
              : generateIconState.complete
              ? 'Use case candidates ready — click to view results'
              : generateIconState.error
              ? 'Use case generation failed — click to see details and retry'
              : 'Generate candidate use cases using AI based on the POC context'
          }
        />
        <Button size="sm" onClick={onOpenLibraryPicker}>
          + From library
        </Button>
        <Button size="sm" variant="ghost" onClick={addBlank}>
          + Blank
        </Button>
      </div>

      {poc.useCases.length === 0 && (
        <EmptyState
          title="No use cases yet"
          description="Pick from the library — Databricks/SQL Authorization, Apigee API Gateway, AI Auth, Compliance, etc."
          action={
            <Button onClick={onOpenLibraryPicker} variant="primary">
              Browse library
            </Button>
          }
        />
      )}

      <div className="space-y-3">
        {poc.useCases.map((u, i) => {
          const isLast = i === poc.useCases.length - 1;
          return (
            <div
              key={u.id}
              id={`uc-${u.id}`}
              className="transition-colors duration-300 rounded-md"
            >
              <CollapsibleCard
                expanded={useCasesExpanded.isOpen(u.id)}
                onToggle={() => useCasesExpanded.toggle(u.id)}
                header={
                  <>
                    <Pill tone={u.libraryId ? 'accent' : 'neutral'}>
                      {u.libraryId ? 'LIBRARY' : 'CUSTOM'}
                    </Pill>
                    <Pill>{u.category.toUpperCase()}</Pill>
                    <span className="text-[13px] truncate flex-1">
                      {u.title || (
                        <span className="text-[var(--color-text-dim)]">Untitled use case</span>
                      )}
                    </span>
                    {u.persona && (
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate hidden md:inline">
                        {u.persona}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          move(u.id, -1);
                        }}
                        title="Move up"
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          move(u.id, 1);
                        }}
                        title="Move down"
                      >
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(u.id);
                        }}
                        title="Remove"
                      >
                        ×
                      </Button>
                    </span>
                  </>
                }
              >
                <div className="mt-2">
                  <Field label="Title" required>
                    <input
                      ref={isLast ? useCaseFocusRef : undefined}
                      value={u.title}
                      onChange={(e) => update(u.id, { title: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Category">
                      <select
                        value={u.category}
                        onChange={(e) =>
                          update(u.id, { category: e.target.value as UseCase['category'] })
                        }
                      >
                        <option value="Data">Data</option>
                        <option value="API Gateway">API Gateway</option>
                        <option value="AI Authorization">AI Authorization</option>
                        <option value="Identity">Identity</option>
                        <option value="Compliance">Compliance</option>
                        <option value="Application">Application</option>
                        <option value="Other">Other</option>
                      </select>
                    </Field>
                    <Field label="Persona">
                      <input
                        value={u.persona}
                        onChange={(e) => update(u.id, { persona: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Objectives" hint="One bullet per line." required>
                    <textarea
                      rows={4}
                      value={u.objectives}
                      onChange={(e) => update(u.id, { objectives: e.target.value })}
                    />
                  </Field>
                  <Field label="Success criteria" hint="One bullet per line." required>
                    <textarea
                      rows={4}
                      value={u.successCriteria}
                      onChange={(e) => update(u.id, { successCriteria: e.target.value })}
                    />
                  </Field>
                </div>
              </CollapsibleCard>
            </div>
          );
        })}
      </div>

      {/* AI: Generate use cases modal */}
      <Modal
        open={generateModalOpen}
        onClose={() => {
          setGenerateModalOpen(false);
          setGenerated([]);
          setGeneratedSelection([]);
          setGenerateError(null);
        }}
        title="Generate use cases"
        width={760}
      >
        <p className="text-[12.5px] text-[var(--color-text-muted)] mb-4 leading-relaxed">
          AI-generated use case candidates based on this POC's customer context, in-scope systems,
          and existing use cases. Review, deselect any you don't want, and click Insert to add
          them. You can edit them after insertion.
        </p>

        {generating && (
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
            <span>Generating…</span>
          </div>
        )}

        {generateError && !generating && (
          <div className="bg-[var(--color-pill-danger-bg)] border border-[var(--color-pill-danger-border)] rounded-md px-3 py-2 mb-4">
            <p className="text-[12px] text-[var(--color-danger)]">{generateError}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setGenerateModalOpen(false);
                void runGenerate();
              }}
              className="mt-2"
            >
              Try again
            </Button>
          </div>
        )}

        {!generating && generated.length > 0 && (
          <div className="space-y-2 mb-4">
            {generated.map((g) => {
              const selected = generatedSelection.includes(g.tempId);
              return (
                <div
                  key={g.tempId}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGeneratedSelection(g.tempId)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      toggleGeneratedSelection(g.tempId);
                    }
                  }}
                  className={`cursor-pointer rounded-md p-3 transition-colors flex gap-3 items-start border ${
                    selected
                      ? 'bg-[var(--color-pill-accent-bg)] border-[var(--color-pill-accent-border)]'
                      : 'bg-[var(--color-bg)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
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
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <Pill tone="neutral">{g.category.toUpperCase()}</Pill>
                      <span className="text-[13px] font-medium text-[var(--color-text)]">
                        {g.title}
                      </span>
                    </div>
                    {g.persona && (
                      <div className="mono text-[10px] tracking-wider text-[var(--color-text-dim)] mb-1">
                        Persona: {g.persona}
                      </div>
                    )}
                    {g.objectives && (
                      <p className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed mb-1">
                        <strong>Objectives:</strong> {g.objectives}
                      </p>
                    )}
                    {g.successCriteria && (
                      <p className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed whitespace-pre-line">
                        <strong>Success criteria:</strong>
                        {'\n'}
                        {g.successCriteria}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button
            variant="ghost"
            onClick={() => {
              setGenerateModalOpen(false);
              void runGenerate();
            }}
            disabled={generating}
          >
            Regenerate
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setGenerateModalOpen(false);
                setGenerated([]);
                setGeneratedSelection([]);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={acceptSelectedGenerated}
              disabled={generatedSelection.length === 0 || generating}
            >
              Insert {generatedSelection.length || ''}{' '}
              {generatedSelection.length === 1 ? 'use case' : 'use cases'}
            </Button>
          </div>
        </div>
      </Modal>
    </SectionCard>
  );
}
// ============================================================
export function DependenciesSection({ poc, set, firstIncompleteId }: SectionProps) {
  return (
    <SectionCard
      id="dependencies"
      number="10"
      title="Dependencies & Pre-Requisites"
      description="Who's responsible for what, and what's still open."
      status={status(poc, 'dependencies')}
      summary={summarizeSection(poc, 'dependencies')}
      defaultOpen={firstIncompleteId === 'dependencies'}
    >
      <Field label={`${poc.customerName || 'Customer'} responsibilities`} required>
        <textarea
          rows={6}
          value={poc.customerResponsibilities}
          onChange={(e) => set({ customerResponsibilities: e.target.value })}
          placeholder={`Provision a Kubernetes cluster (namespace) for PlainID component deployment
Provide network connectivity to data sources and identity stores
Identify a network/infrastructure contact for connectivity setup
Provision test user accounts representing each persona`}
        />
      </Field>
      <Field label="PlainID responsibilities" required>
        <textarea
          rows={6}
          value={poc.plainidResponsibilities}
          onChange={(e) => set({ plainidResponsibilities: e.target.value })}
          placeholder={`Provision PlainID SaaS tenant (PAP) scoped for the POC
Provide Helm charts and deployment documentation
Lead authorizer configuration and integration testing`}
        />
      </Field>
      <Field label="Open items to resolve" hint="Optional. One per line.">
        <textarea
          rows={4}
          value={poc.openItems}
          onChange={(e) => set({ openItems: e.target.value })}
        />
      </Field>
    </SectionCard>
  );
}

// ============================================================
// 09 — Tracker
// ============================================================
export function TrackerSection({ poc, set, firstIncompleteId }: SectionProps) {
  const trackerFocusRef = useFocusOnAppend(poc.tracker.length);
  const addRow = () =>
    set({
      tracker: [
        ...poc.tracker,
        { id: uid(), phase: '', task: '', responsible: '', status: 'Not Started', dueDate: '' },
      ],
    });
  const update = (id: string, patch: Partial<TrackerRow>) =>
    set({ tracker: poc.tracker.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const remove = (id: string) =>
    set({ tracker: poc.tracker.filter((t) => t.id !== id) });

  // Bulk paste — parses TSV (tab-separated, what spreadsheets paste as)
  // or CSV. Columns: Phase, Task, Responsible, Status, Due. Status defaults
  // to "Not Started" if missing. Empty/whitespace lines are skipped.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const validStatuses: Record<string, TrackerRow['status']> = {
    'not started': 'Not Started',
    'in progress': 'In Progress',
    completed: 'Completed',
    blocked: 'Blocked',
  };

  function parsePastedRows(text: string): Omit<TrackerRow, 'id'>[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // Detect delimiter: tabs (spreadsheet paste) preferred; fall back to comma
        const cols = line.includes('\t') ? line.split('\t') : line.split(/\s*,\s*/);
        const [phase = '', task = '', responsible = '', statusRaw = '', dueDate = ''] = cols.map(
          (c) => c.trim(),
        );
        const status = validStatuses[statusRaw.toLowerCase()] ?? 'Not Started';
        return { phase, task, responsible, status, dueDate };
      })
      .filter((r) => r.phase || r.task); // require at least phase or task to count
  }

  const pasteParsed = pasteText.trim() ? parsePastedRows(pasteText) : [];

  function applyPaste() {
    const newRows = pasteParsed.map((r) => ({ id: uid(), ...r }));
    set({ tracker: [...poc.tracker, ...newRows] });
    setPasteOpen(false);
    setPasteText('');
  }

  return (
    <SectionCard
      id="tracker"
      number="11"
      title="POC Tracker"
      description="Phased task list. Pre-populated from the standard PlainID engagement template — edit as needed."
      status={status(poc, 'tracker')}
      summary={summarizeSection(poc, 'tracker')}
      defaultOpen={firstIncompleteId === 'tracker'}
    >
      <div className="flex items-center justify-end mb-2 gap-2">
        <Button size="sm" variant="ghost" onClick={() => setPasteOpen(true)}>
          Paste rows
        </Button>
        <Button size="sm" onClick={addRow}>
          + Add row
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] table-fixed">
          <colgroup>
            <col style={{ width: '15%' }} />
            <col style={{ width: '38%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '3%' }} />
          </colgroup>
          <thead>
            <tr className="text-left text-[var(--color-text-dim)] mono text-[10px] tracking-widest">
              <th className="py-1.5 pr-2 font-medium">PHASE</th>
              <th className="py-1.5 pr-2 font-medium">TASK</th>
              <th className="py-1.5 pr-2 font-medium">RESPONSIBLE</th>
              <th className="py-1.5 pr-2 font-medium">STATUS</th>
              <th className="py-1.5 pr-2 font-medium">DUE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {poc.tracker.map((t, idx) => (
              <tr key={t.id} className="border-t border-[var(--color-border)] group">
                <td className="py-1 pr-2">
                  <input
                    ref={idx === poc.tracker.length - 1 ? trackerFocusRef : undefined}
                    className="!h-7 !text-[12px]"
                    value={t.phase}
                    onChange={(e) => update(t.id, { phase: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className="!h-7 !text-[12px]"
                    value={t.task}
                    onChange={(e) => update(t.id, { task: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className="!h-7 !text-[12px]"
                    value={t.responsible}
                    onChange={(e) => update(t.id, { responsible: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    className="!h-7 !text-[12px] !pr-7"
                    value={t.status}
                    onChange={(e) =>
                      update(t.id, { status: e.target.value as TrackerRow['status'] })
                    }
                  >
                    <option>Not Started</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                    <option>Blocked</option>
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    className="!h-7 !text-[12px]"
                    type="date"
                    value={t.dueDate}
                    onChange={(e) => update(t.id, { dueDate: e.target.value })}
                  />
                </td>
                <td className="py-1 align-middle">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(t.id)}
                    className="!h-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    aria-label="Remove row"
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={pasteOpen}
        onClose={() => {
          setPasteOpen(false);
          setPasteText('');
        }}
        title="Paste tracker rows"
        width={720}
      >
        <p className="text-[12.5px] text-[var(--color-text-muted)] mb-3 leading-relaxed">
          Paste rows from a spreadsheet (Excel, Google Sheets, Numbers) or comma-separated text.
          Columns: <strong className="text-[var(--color-text)]">Phase, Task, Responsible, Status, Due</strong>.
          Status and Due are optional. Status defaults to "Not Started" if blank.
        </p>
        <Field label="Paste here">
          <textarea
            rows={8}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`Kickoff & Planning\tDefine POC scope\tCustomer + PlainID\tNot Started\t2026-06-01\nIntegration\tConfigure PIP\tPlainID\tIn Progress\t`}
            autoFocus
          />
        </Field>
        {pasteParsed.length > 0 && (
          <div className="mt-3 border border-[var(--color-border)] rounded-md p-2.5 bg-[var(--color-bg)] max-h-[180px] overflow-y-auto">
            <div className="mono text-[10px] tracking-widest text-[var(--color-text-dim)] mb-1.5">
              PARSED · {pasteParsed.length} {pasteParsed.length === 1 ? 'ROW' : 'ROWS'}
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[var(--color-text-dim)]">
                  <th className="font-medium pb-1 pr-2">Phase</th>
                  <th className="font-medium pb-1 pr-2">Task</th>
                  <th className="font-medium pb-1 pr-2">Responsible</th>
                  <th className="font-medium pb-1 pr-2">Status</th>
                  <th className="font-medium pb-1">Due</th>
                </tr>
              </thead>
              <tbody>
                {pasteParsed.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td className="py-1 pr-2 truncate">{r.phase || '—'}</td>
                    <td className="py-1 pr-2 truncate">{r.task || '—'}</td>
                    <td className="py-1 pr-2 truncate">{r.responsible || '—'}</td>
                    <td className="py-1 pr-2 truncate">{r.status}</td>
                    <td className="py-1 truncate">{r.dueDate || '—'}</td>
                  </tr>
                ))}
                {pasteParsed.length > 20 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-1 text-[var(--color-text-dim)] italic text-center"
                    >
                      + {pasteParsed.length - 20} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button
            variant="ghost"
            onClick={() => {
              setPasteOpen(false);
              setPasteText('');
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={applyPaste} disabled={pasteParsed.length === 0}>
            Append {pasteParsed.length || ''} {pasteParsed.length === 1 ? 'row' : 'rows'}
          </Button>
        </div>
      </Modal>
    </SectionCard>
  );
}

// ============================================================
// 10 — Reference Documentation
// ============================================================
export function DocsSection({ poc, set, firstIncompleteId }: SectionProps) {
  const docFocusRef = useFocusOnAppend(poc.referenceDocs.length);
  const docsExpanded = useExpandedSet(poc.referenceDocs.map((d) => d.id));
  const addDoc = () =>
    set({
      referenceDocs: [
        ...poc.referenceDocs,
        { id: uid(), title: '', url: '', description: '' },
      ],
    });
  const update = (id: string, patch: Partial<ReferenceDoc>) =>
    set({
      referenceDocs: poc.referenceDocs.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  const remove = (id: string) =>
    set({ referenceDocs: poc.referenceDocs.filter((d) => d.id !== id) });

  return (
    <SectionCard
      id="docs"
      number="12"
      title="Reference Documentation"
      description="Public PlainID docs to share with the customer. Defaults are seeded — add or remove as needed."
      status={status(poc, 'docs')}
      summary={summarizeSection(poc, 'docs')}
      defaultOpen={firstIncompleteId === 'docs'}
    >
      <div className="flex items-center justify-end mb-2">
        <Button size="sm" onClick={addDoc}>
          + Add doc
        </Button>
      </div>
      <div className="space-y-2">
        {poc.referenceDocs.map((d, idx) => {
          const isLast = idx === poc.referenceDocs.length - 1;
          return (
            <CollapsibleCard
              key={d.id}
              expanded={docsExpanded.isOpen(d.id)}
              onToggle={() => docsExpanded.toggle(d.id)}
              header={
                <>
                  <span className="text-[13px] truncate">
                    {d.title || <span className="text-[var(--color-text-dim)]">Untitled doc</span>}
                  </span>
                  {d.url && (
                    <span className="text-[11px] text-[var(--color-text-muted)] truncate hidden md:inline">
                      {d.url}
                    </span>
                  )}
                  <span className="ml-auto flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(d.id);
                      }}
                    >
                      ×
                    </Button>
                  </span>
                </>
              }
            >
              <div className="grid grid-cols-12 gap-2 mt-2">
                <div className="col-span-12">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    Title
                  </label>
                  <input
                    ref={isLast ? docFocusRef : undefined}
                    placeholder="Title"
                    value={d.title}
                    onChange={(e) => update(d.id, { title: e.target.value })}
                  />
                </div>
                <div className="col-span-12 mt-2">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://docs.plainid.com/..."
                    value={d.url}
                    onChange={(e) => update(d.id, { url: e.target.value })}
                  />
                </div>
                <div className="col-span-12 mt-2">
                  <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">
                    Description
                  </label>
                  <input
                    placeholder="Short description"
                    value={d.description}
                    onChange={(e) => update(d.id, { description: e.target.value })}
                  />
                </div>
              </div>
            </CollapsibleCard>
          );
        })}
      </div>
    </SectionCard>
  );
}
