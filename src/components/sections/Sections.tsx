import React, { useState } from 'react';
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
} from '../../types';
import { Field, Button, SectionCard, Pill, EmptyState, Modal } from '../ui/Primitives';
import { AiButton } from '../ui/AiButton';
import { evaluateSection } from '../../lib/completeness';
import { emptyTechnicalSpec, reshapeTechnicalSpec } from '../../lib/technical-spec';
import { generate } from '../../lib/ai';
import { buildFieldSuggestPrompt, FIELD_PROMPTS } from '../../lib/ai-prompts';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

interface SectionProps {
  poc: PocDocument;
  set: (patch: Partial<PocDocument>) => void;
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

// ============================================================
// 01 — Customer
// ============================================================
export function CustomerSection({ poc, set }: SectionProps) {
  const overviewSuggest = useFieldSuggest('customerOverview', poc, set, poc.id);
  return (
    <SectionCard
      id="customer"
      number="01"
      title="Customer"
      description="The basics. The customer name interpolates into the PlainID Overview prose and several headings."
      status={status(poc, 'customer')}
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
export function ContextSection({ poc, set }: SectionProps) {
  const compellingSuggest = useFieldSuggest('compellingEvent', poc, set, poc.id);
  const authContextSuggest = useFieldSuggest('authorizationContext', poc, set, poc.id);
  return (
    <SectionCard
      id="context"
      number="02"
      title="Compelling Event"
      description="The why-now. If this section is hand-wavy, the POC isn't qualified. Name the trigger: a go-live, a regulatory deadline, a migration, a security incident, an audit finding."
      status={status(poc, 'context')}
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
export function ObjectivesSection({ poc, set }: SectionProps) {
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
export function DiscoverySection({ poc, set }: SectionProps) {
  const archSuggest = useFieldSuggest('architectureConstraints', poc, set, poc.id);
  const addSystem = () =>
    set({
      inScopeSystems: [
        ...poc.inScopeSystems,
        { id: uid(), name: '', focus: '', priority: 'P1' as const },
      ],
    });
  const updateSystem = (id: string, patch: Partial<InScopeSystem>) =>
    set({
      inScopeSystems: poc.inScopeSystems.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const removeSystem = (id: string) =>
    set({ inScopeSystems: poc.inScopeSystems.filter((s) => s.id !== id) });

  const addIdentity = () =>
    set({
      identitySources: [
        ...poc.identitySources,
        { id: uid(), name: '', type: '', notes: '' },
      ],
    });
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
    >
      <Field
        label="Tenant strategy"
        hint="Whose tenant runs the POC, who has access, why. Optional. Useful when the customer owns the tenant and PlainID drives via screenshare, or vice versa."
      >
        <textarea
          rows={4}
          value={poc.tenantStrategy}
          onChange={(e) => set({ tenantStrategy: e.target.value })}
          placeholder="The POC will run in the customer's PlainID tenant. The tenant has been provisioned and IdP integration is complete. PlainID does not have direct access — sessions are driven by the customer team with PlainID providing real-time guidance..."
        />
      </Field>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label>In-scope systems &amp; platforms</label>
          <Button size="sm" onClick={addSystem}>
            + Add system
          </Button>
        </div>
        {poc.inScopeSystems.length === 0 && (
          <EmptyState
            title="No systems yet"
            description="Add the platforms in scope for this POC (Databricks, Apigee, Snowflake, Oracle HCM, etc.) along with their priority tier."
          />
        )}
        <div className="space-y-2">
          {poc.inScopeSystems.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-12 gap-2 items-start bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-2"
            >
              <input
                className="col-span-3"
                placeholder="System name"
                value={s.name}
                onChange={(e) => updateSystem(s.id, { name: e.target.value })}
              />
              <input
                className="col-span-7"
                placeholder="POC focus"
                value={s.focus}
                onChange={(e) => updateSystem(s.id, { focus: e.target.value })}
              />
              <select
                className="col-span-1"
                value={s.priority}
                onChange={(e) =>
                  updateSystem(s.id, { priority: e.target.value as InScopeSystem['priority'] })
                }
              >
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
              <Button
                size="sm"
                variant="ghost"
                className="col-span-1 justify-center"
                onClick={() => removeSystem(s.id)}
                title="Remove"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label>Identity infrastructure</label>
          <Button size="sm" onClick={addIdentity}>
            + Add source
          </Button>
        </div>
        <div className="space-y-2">
          {poc.identitySources.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-12 gap-2 items-start bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-2"
            >
              <input
                className="col-span-3"
                placeholder="Name (e.g. Ping Identity)"
                value={s.name}
                onChange={(e) => updateIdentity(s.id, { name: e.target.value })}
              />
              <input
                className="col-span-3"
                placeholder="Type (e.g. Primary IdP)"
                value={s.type}
                onChange={(e) => updateIdentity(s.id, { type: e.target.value })}
              />
              <input
                className="col-span-5"
                placeholder="Notes"
                value={s.notes}
                onChange={(e) => updateIdentity(s.id, { notes: e.target.value })}
              />
              <Button
                size="sm"
                variant="ghost"
                className="col-span-1 justify-center"
                onClick={() => removeIdentity(s.id)}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </div>

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
    </SectionCard>
  );
}

// ============================================================
// 05 — Timeline
// ============================================================
export function TimelineSection({ poc, set }: SectionProps) {
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
      number="05"
      title="Timeline"
      description="High-level timeline summary plus 2-week sprint structure aligned to use-case clusters."
      status={status(poc, 'timeline')}
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
        {poc.sprints.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-12 gap-2 items-start bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-2"
          >
            <input
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
export function FrameworkSection({ poc, set }: SectionProps) {
  const addPersona = () =>
    set({ personas: [...poc.personas, { id: uid(), name: '', description: '' }] });
  const updatePersona = (id: string, patch: Partial<Persona>) =>
    set({ personas: poc.personas.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const removePersona = (id: string) =>
    set({ personas: poc.personas.filter((p) => p.id !== id) });

  const addMember = (org: string) =>
    set({
      teamMembers: [...poc.teamMembers, { id: uid(), org, name: '', role: '', email: '' }],
    });
  const updateMember = (id: string, patch: Partial<TeamMember>) =>
    set({
      teamMembers: poc.teamMembers.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  const removeMember = (id: string) =>
    set({ teamMembers: poc.teamMembers.filter((m) => m.id !== id) });

  return (
    <SectionCard
      id="framework"
      number="06"
      title="Framework"
      description="Cadence, personas, and the named humans on both sides of the engagement."
      status={status(poc, 'framework')}
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
        {poc.personas.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-12 gap-2 items-start bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-2"
          >
            <input
              className="col-span-3"
              placeholder="Name"
              value={p.name}
              onChange={(e) => updatePersona(p.id, { name: e.target.value })}
            />
            <input
              className="col-span-8"
              placeholder="Description"
              value={p.description}
              onChange={(e) => updatePersona(p.id, { description: e.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="col-span-1 justify-center"
              onClick={() => removePersona(p.id)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-2">
        <label>POC team members</label>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => addMember(poc.customerName || 'Customer')}>
            + Customer
          </Button>
          <Button size="sm" onClick={() => addMember('PlainID')}>
            + PlainID
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {poc.teamMembers.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-12 gap-2 items-start bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-2"
          >
            <input
              className="col-span-2"
              placeholder="Org"
              value={m.org}
              onChange={(e) => updateMember(m.id, { org: e.target.value })}
            />
            <input
              className="col-span-3"
              placeholder="Name"
              value={m.name}
              onChange={(e) => updateMember(m.id, { name: e.target.value })}
            />
            <input
              className="col-span-3"
              placeholder="Role"
              value={m.role}
              onChange={(e) => updateMember(m.id, { role: e.target.value })}
            />
            <input
              className="col-span-3"
              placeholder="Email"
              type="email"
              value={m.email}
              onChange={(e) => updateMember(m.id, { email: e.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="col-span-1 justify-center"
              onClick={() => removeMember(m.id)}
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
// 07 — Use Cases
// ============================================================
export function UseCasesSection({
  poc,
  set,
  library,
  onOpenLibraryPicker,
}: SectionProps & {
  library: UseCaseLibraryEntry[];
  onOpenLibraryPicker: () => void;
}) {
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
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<
    { tempId: string; title: string; category: string; persona: string; objectives: string; successCriteria: string }[]
  >([]);
  const [generatedSelection, setGeneratedSelection] = useState<string[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);

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
    try {
      const { buildGenerateUseCasesPrompt, parseGeneratedUseCases } = await import(
        '../../lib/ai-prompts'
      );
      const built = buildGenerateUseCasesPrompt(poc, 3);
      const result = await generate({
        prompt: built.prompt,
        system: built.system,
        maxTokens: built.maxTokens,
        feature: 'generate-use-cases',
        pocId: poc.id,
      });
      const parsed = parseGeneratedUseCases(result.text);
      if (parsed.length === 0) {
        setGenerateError('AI returned no usable use cases. Please try again.');
        setGenerated([]);
      } else {
        const withIds = parsed.map((p) => ({ tempId: uid(), ...p }));
        setGenerated(withIds);
        setGeneratedSelection(withIds.map((p) => p.tempId));
      }
    } catch (err: any) {
      setGenerateError(err?.message ?? 'AI generation failed');
      setGenerated([]);
    } finally {
      setGenerating(false);
    }
  };

  const openGenerateModal = () => {
    setGenerateModalOpen(true);
    setGenerated([]);
    setGeneratedSelection([]);
    setGenerateError(null);
    void runGenerate();
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
      number="07"
      title="Use Cases"
      description="The meat of the POC. Pick from the library to drop a fully-formed use case in (snapshotted at insertion — library updates won't propagate). Then customize."
      status={status(poc, 'usecases')}
    >
      <div className="flex items-center justify-end gap-2 mb-3">
        <AiButton
          label="Generate"
          onRun={openGenerateModal}
          loading={false}
          title="Generate candidate use cases using AI based on the POC context"
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
        {poc.useCases.map((u, i) => (
          <div
            key={u.id}
            className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-4"
          >
            <header className="flex items-center gap-2 mb-3">
              <Pill tone={u.libraryId ? 'accent' : 'neutral'}>
                {u.libraryId ? 'FROM LIBRARY' : 'CUSTOM'}
              </Pill>
              <Pill>{u.category.toUpperCase()}</Pill>
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => move(u.id, -1)} title="Move up">
                  ↑
                </Button>
                <Button size="sm" variant="ghost" onClick={() => move(u.id, 1)} title="Move down">
                  ↓
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(u.id)} title="Remove">
                  ×
                </Button>
              </div>
            </header>
            <Field label="Title" required>
              <input
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
        ))}
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
            <Button size="sm" variant="ghost" onClick={runGenerate} className="mt-2">
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
          <Button variant="ghost" onClick={runGenerate} disabled={generating}>
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
export function DependenciesSection({ poc, set }: SectionProps) {
  return (
    <SectionCard
      id="dependencies"
      number="08"
      title="Dependencies & Pre-Requisites"
      description="Who's responsible for what, and what's still open."
      status={status(poc, 'dependencies')}
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
export function TrackerSection({ poc, set }: SectionProps) {
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
      number="09"
      title="POC Tracker"
      description="Phased task list. Pre-populated from the standard PlainID engagement template — edit as needed."
      status={status(poc, 'tracker')}
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
            {poc.tracker.map((t) => (
              <tr key={t.id} className="border-t border-[var(--color-border)] group">
                <td className="py-1 pr-2">
                  <input
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
export function DocsSection({ poc, set }: SectionProps) {
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
      number="10"
      title="Reference Documentation"
      description="Public PlainID docs to share with the customer. Defaults are seeded — add or remove as needed."
      status={status(poc, 'docs')}
    >
      <div className="flex items-center justify-end mb-2">
        <Button size="sm" onClick={addDoc}>
          + Add doc
        </Button>
      </div>
      <div className="space-y-2">
        {poc.referenceDocs.map((d) => (
          <div
            key={d.id}
            className="grid grid-cols-12 gap-2 items-start bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-2"
          >
            <input
              className="col-span-4"
              placeholder="Title"
              value={d.title}
              onChange={(e) => update(d.id, { title: e.target.value })}
            />
            <input
              className="col-span-3"
              placeholder="URL"
              type="url"
              value={d.url}
              onChange={(e) => update(d.id, { url: e.target.value })}
            />
            <input
              className="col-span-4"
              placeholder="Description"
              value={d.description}
              onChange={(e) => update(d.id, { description: e.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="col-span-1 justify-center"
              onClick={() => remove(d.id)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
