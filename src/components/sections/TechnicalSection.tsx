import React from 'react';
import type {
  PocDocument,
  TechnicalFoundation,
  UseCase,
  UseCaseCategory,
  UnknownableField,
  UrlEntry,
  TechnicalSpec,
  AuthorizerSpec,
  DataSpec,
  ApiGatewaySpec,
  AiAuthSpec,
  ApplicationSpec,
  IdentitySpec,
  ComplianceSpec,
} from '../../types';
import {
  AUTHORIZER_CATALOG,
  authorizersForCategory,
  findAuthorizer,
  DOWNSTREAM_AUTHORIZER_CATEGORIES,
  CATEGORY_HAS_TECH_BLOCK,
  emptyUF,
} from '../../types';
import { Field, Button, SectionCard, Pill, EmptyState } from '../ui/Primitives';
import { evaluateSection } from '../../lib/completeness';
import { emptyTechnicalFoundation } from '../../lib/technical-spec';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

interface SectionProps {
  poc: PocDocument;
  set: (patch: Partial<PocDocument>) => void;
}

// ============================================================
// Reusable: Unknown-able field with quiet toggle
// ============================================================
function UFInput({
  field,
  onChange,
  rows = 1,
  placeholder,
}: {
  field: UnknownableField;
  onChange: (next: UnknownableField) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      {rows > 1 ? (
        <textarea
          rows={rows}
          value={field.value}
          disabled={field.unknown}
          placeholder={field.unknown ? 'TBD — to resolve during POC' : placeholder}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
          className={field.unknown ? 'opacity-50' : ''}
        />
      ) : (
        <input
          type="text"
          value={field.value}
          disabled={field.unknown}
          placeholder={field.unknown ? 'TBD — to resolve during POC' : placeholder}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
          className={field.unknown ? 'opacity-50' : ''}
        />
      )}
      <label className="flex items-center gap-1.5 mt-1 cursor-pointer select-none mb-0">
        <input
          type="checkbox"
          checked={field.unknown}
          onChange={(e) => onChange({ ...field, unknown: e.target.checked })}
          className="!w-auto !h-auto m-0"
        />
        <span className="text-[10.5px] text-[var(--color-text-dim)] normal-case tracking-normal">
          Unknown
        </span>
      </label>
    </div>
  );
}

// ============================================================
// Reusable: URL list (label + url + notes)
// ============================================================
function UrlList({
  entries,
  onChange,
  placeholder = 'https://...',
  labelPlaceholder = 'Label',
  addLabel = '+ URL',
}: {
  entries: UrlEntry[];
  onChange: (next: UrlEntry[]) => void;
  placeholder?: string;
  labelPlaceholder?: string;
  addLabel?: string;
}) {
  const add = () =>
    onChange([...entries, { id: uid(), label: '', url: '', notes: '' }]);
  const update = (id: string, patch: Partial<UrlEntry>) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(entries.filter((e) => e.id !== id));

  return (
    <div>
      <div className="space-y-2 mb-2">
        {entries.map((e) => (
          <div
            key={e.id}
            className="grid grid-cols-12 gap-2 items-start bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md p-2"
          >
            <input
              className="col-span-3"
              placeholder={labelPlaceholder}
              value={e.label}
              onChange={(ev) => update(e.id, { label: ev.target.value })}
            />
            <input
              className="col-span-5"
              placeholder={placeholder}
              type="url"
              value={e.url}
              onChange={(ev) => update(e.id, { url: ev.target.value })}
            />
            <input
              className="col-span-3"
              placeholder="Notes"
              value={e.notes}
              onChange={(ev) => update(e.id, { notes: ev.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="col-span-1 justify-center"
              onClick={() => remove(e.id)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={add}>
        {addLabel}
      </Button>
    </div>
  );
}

// ============================================================
// POC-level Universal block (rendered once at top of section)
// ============================================================
function UniversalFoundationBlock({
  foundation,
  onChange,
}: {
  foundation: TechnicalFoundation;
  onChange: (next: TechnicalFoundation) => void;
}) {
  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-4 mb-6">
      <header className="flex items-baseline gap-2 mb-3">
        <span className="mono text-[11px] tracking-widest text-[var(--color-accent)]">
          UNIVERSAL
        </span>
        <span className="text-[12.5px] text-[var(--color-text-muted)]">
          Identity & test users — applies to every use case
        </span>
      </header>
      <Field label="JWT / OIDC samples" required hint="Decoded JWT samples or token introspection links.">
        <UrlList
          entries={foundation.jwtSampleUrls}
          onChange={(next) => onChange({ ...foundation, jwtSampleUrls: next })}
          labelPlaceholder="e.g. Employee JWT sample"
        />
      </Field>
      <Field label="Identity attributes" required hint="Available claims, types, refresh cadence.">
        <UFInput
          field={foundation.identityAttributeCatalog}
          onChange={(f) => onChange({ ...foundation, identityAttributeCatalog: f })}
          rows={3}
          placeholder="employeeId, dept, groups[], region; refreshed at token issue"
        />
      </Field>
      <Field label="Test users" required hint="Min 3–5 accounts; provisioning owner; access path.">
        <UFInput
          field={foundation.testUserAccounts}
          onChange={(f) => onChange({ ...foundation, testUserAccounts: f })}
          rows={3}
          placeholder="5 accounts in test IdP, 1 per persona; creds in shared vault"
        />
      </Field>
    </div>
  );
}

// ============================================================
// Authorizer block
// ============================================================
function AuthorizerBlock({
  uc,
  spec,
  allUseCases,
  inScopeAuthorizerIds,
  onChange,
  onCopyFrom,
}: {
  uc: UseCase;
  spec: AuthorizerSpec;
  allUseCases: UseCase[];
  /**
   * IDs of authorizers that the SE has marked as in-scope via the In-Scope
   * Systems table. Used to suggest the matching authorizer in this dropdown
   * — selection is loose (a hint), not enforced.
   */
  inScopeAuthorizerIds: string[];
  onChange: (next: AuthorizerSpec) => void;
  onCopyFrom: (sourceUseCaseId: string) => void;
}) {
  const isDownstream = DOWNSTREAM_AUTHORIZER_CATEGORIES.includes(uc.category);
  if (isDownstream) return null;

  const copyCandidates = allUseCases.filter(
    (other) =>
      other.id !== uc.id &&
      other.category === uc.category &&
      other.technicalSpec?.authorizer.selectedAuthorizerId === spec.selectedAuthorizerId &&
      other.technicalSpec?.authorizer.selectedAuthorizerId !== 'custom',
  );

  const setSelected = (authorizerId: string) => {
    const auth = findAuthorizer(authorizerId);
    const docs =
      spec.authorizerDocs.length === 0 && auth?.docsUrl
        ? [{ id: uid(), label: 'Documentation', url: auth.docsUrl, notes: '' }]
        : spec.authorizerDocs;
    // Apply catalog defaults only to empty + non-unknown fields.
    // We never overwrite user input or "Unknown — TBD" markers.
    const fillIfEmpty = (current: UnknownableField, defaultValue?: string): UnknownableField =>
      defaultValue && !current.unknown && current.value.trim() === ''
        ? { value: defaultValue, unknown: false }
        : current;
    const d = auth?.defaults;
    onChange({
      ...spec,
      selectedAuthorizerId: authorizerId,
      authorizerDocs: docs,
      enforcementMode: fillIfEmpty(spec.enforcementMode, d?.enforcementMode),
      deploymentTopology: fillIfEmpty(spec.deploymentTopology, d?.deploymentTopology),
      failureMode: fillIfEmpty(spec.failureMode, d?.failureMode),
    });
  };

  const updateField = (key: keyof AuthorizerSpec, next: UnknownableField) =>
    onChange({ ...spec, [key]: next });

  const catalogForCategory = authorizersForCategory(uc.category);
  const selectedEntry = findAuthorizer(spec.selectedAuthorizerId);

  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <header className="flex items-center gap-2 mb-3">
        <span className="mono text-[11px] tracking-widest text-[var(--color-accent)]">
          AUTHORIZER
        </span>
        {selectedEntry && (
          <Pill tone="neutral">{selectedEntry.enforcementMode.toUpperCase()}</Pill>
        )}
      </header>

      <Field label="Authorizer" required>
        <select
          value={spec.selectedAuthorizerId}
          onChange={(e) => setSelected(e.target.value)}
        >
          {catalogForCategory.map((a) => {
            const inScope = inScopeAuthorizerIds.includes(a.id);
            return (
              <option key={a.id} value={a.id}>
                {inScope ? '✓ ' : ''}
                {a.name}
                {inScope ? ' — in scope' : ''}
              </option>
            );
          })}
          <option value="custom">Other / Custom…</option>
        </select>
      </Field>
      {inScopeAuthorizerIds.length > 0 && !inScopeAuthorizerIds.includes(spec.selectedAuthorizerId) && spec.selectedAuthorizerId !== 'custom' && (
        <div className="-mt-2 mb-3 text-[11.5px] text-[var(--color-warning)] leading-relaxed">
          Heads up — this authorizer isn't listed in the In-Scope Systems table. Verify the use case maps to a system that's actually in scope, or update Section 04.
        </div>
      )}

      {selectedEntry && (
        <div className="-mt-2 mb-4 text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">
          {selectedEntry.shortDescription}
        </div>
      )}

      {spec.selectedAuthorizerId === 'custom' && (
        <Field label="Custom authorizer name" required>
          <UFInput
            field={spec.customAuthorizerName}
            onChange={(f) => updateField('customAuthorizerName', f)}
            placeholder="Vendor or build name"
          />
        </Field>
      )}

      {copyCandidates.length > 0 && (
        <div className="mb-4 -mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[var(--color-text-dim)]">Copy from:</span>
          {copyCandidates.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant="ghost"
              onClick={() => onCopyFrom(c.id)}
              title={`Copy authorizer fields from "${c.title || '(untitled)'}"`}
            >
              {c.title || '(untitled)'}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
        <Field label="Version" required>
          <UFInput
            field={spec.version}
            onChange={(f) => updateField('version', f)}
            placeholder="4.5.2"
          />
        </Field>
        <Field label="Enforcement mode" required hint="Proxy, native, SDK, plugin, lambda.">
          <UFInput
            field={spec.enforcementMode}
            onChange={(f) => updateField('enforcementMode', f)}
            placeholder="Proxy (inline)"
          />
        </Field>
        <Field label="Deployment" required hint="Helm, Docker, Lambda, plugin, etc.">
          <UFInput
            field={spec.deploymentTopology}
            onChange={(f) => updateField('deploymentTopology', f)}
            placeholder="Helm chart in customer K8s"
          />
        </Field>
        <Field label="Target" required hint="Where it runs.">
          <UFInput
            field={spec.deploymentTarget}
            onChange={(f) => updateField('deploymentTarget', f)}
            placeholder="customer EKS / us-east-1"
          />
        </Field>
        <Field label="PDP endpoint" required>
          <UFInput
            field={spec.pdpEndpoint}
            onChange={(f) => updateField('pdpEndpoint', f)}
            placeholder="https://runtime.<tenant>.plainid.io/..."
          />
        </Field>
        <Field label="Network path" required hint="Direct, PrivateLink, VPN.">
          <UFInput
            field={spec.networkPath}
            onChange={(f) => updateField('networkPath', f)}
            placeholder="PrivateLink to PlainID SaaS"
          />
        </Field>
        <Field label="Identity sources" required>
          <UFInput
            field={spec.identitySourcePaths}
            onChange={(f) => updateField('identitySourcePaths', f)}
            rows={2}
            placeholder="ldaps://ad.corp:636; https://ping.example.com"
          />
        </Field>
        <Field label="PIP integrations" required hint="Sources to wire before this authorizer works.">
          <UFInput
            field={spec.requiredPipIntegrations}
            onChange={(f) => updateField('requiredPipIntegrations', f)}
            rows={2}
            placeholder="AD groups (LDAP); SailPoint roles (REST)"
          />
        </Field>
        <Field label="Credentials store" required>
          <UFInput
            field={spec.credentialsLocation}
            onChange={(f) => updateField('credentialsLocation', f)}
            placeholder="AWS Secrets Manager / Vault"
          />
        </Field>
        <Field label="Provisioned by" required>
          <UFInput
            field={spec.credentialsProvisioner}
            onChange={(f) => updateField('credentialsProvisioner', f)}
            placeholder="Customer Platform team"
          />
        </Field>
        <Field label="Failure mode" required hint="Open / closed; cache TTL.">
          <UFInput
            field={spec.failureMode}
            onChange={(f) => updateField('failureMode', f)}
            placeholder="Fail-closed; 30s cache"
          />
        </Field>
        <Field label="Latency budget" required>
          <UFInput
            field={spec.performanceBudget}
            onChange={(f) => updateField('performanceBudget', f)}
            placeholder="< 25ms p99"
          />
        </Field>
      </div>

      <Field label="Sample I/O" hint="Before/after for query mod or token enrichment.">
        <UFInput
          field={spec.sampleRequestResponse}
          onChange={(f) => updateField('sampleRequestResponse', f)}
          rows={3}
          placeholder="Original: SELECT * FROM clients;\nAuthorized: SELECT name, region FROM clients WHERE region='US';"
        />
      </Field>

      <Field label="Documentation">
        <UrlList
          entries={spec.authorizerDocs}
          onChange={(next) => onChange({ ...spec, authorizerDocs: next })}
          labelPlaceholder="Deployment Guide"
          addLabel="+ Doc URL"
        />
      </Field>

      <Field label="Open items">
        <UFInput
          field={spec.openItems}
          onChange={(f) => updateField('openItems', f)}
          rows={2}
          placeholder="Confirm egress to PlainID PrivateLink"
        />
      </Field>
    </div>
  );
}

// ============================================================
// Per-category blocks (subheader removed — category pill in card header carries the label)
// ============================================================
function DataBlock({ spec, onChange }: { spec: DataSpec; onChange: (n: DataSpec) => void }) {
  const update = <K extends keyof DataSpec>(key: K, next: DataSpec[K]) =>
    onChange({ ...spec, [key]: next });
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <Field label="Catalog scope" required hint="Catalogs, schemas, tables, approx row counts.">
        <UFInput
          field={spec.catalogScope}
          onChange={(f) => update('catalogScope', f)}
          rows={2}
          placeholder="catalog 'prod' / schema 'sales' / 12 tables / ~80M rows"
        />
      </Field>
      <Field
        label="Classification"
        required
        hint="Existing scheme and where it lives (tags, table comments, external)."
      >
        <UFInput
          field={spec.classificationTaxonomy}
          onChange={(f) => update('classificationTaxonomy', f)}
          rows={2}
          placeholder="L1–L5 stored as Unity Catalog tags"
        />
      </Field>
      <Field label="Classification docs">
        <UrlList
          entries={spec.classificationDocsUrls}
          onChange={(next) => update('classificationDocsUrls', next)}
          labelPlaceholder="Data class policy"
        />
      </Field>
      <Field label="Sample queries" required hint="3–5 representative queries.">
        <UFInput
          field={spec.sampleQueries}
          onChange={(f) => update('sampleQueries', f)}
          rows={4}
          placeholder="SELECT region, SUM(balance) FROM accounts WHERE status='active' GROUP BY region;"
        />
      </Field>
      <Field label="Connection method" required hint="Driver, pooler, identity used to connect.">
        <UFInput
          field={spec.connectionMethod}
          onChange={(f) => update('connectionMethod', f)}
          placeholder="Databricks JDBC via service principal"
        />
      </Field>
      <Field label="Existing access control" required hint="What's there today; what stays vs. replaced.">
        <UFInput
          field={spec.existingAccessControl}
          onChange={(f) => update('existingAccessControl', f)}
          rows={2}
          placeholder="Unity Catalog GRANTs + view-based row filtering — both replaced"
        />
      </Field>
      <Field label="Performance baseline" required hint="Current p50/p95; target with PlainID in path.">
        <UFInput
          field={spec.performanceBaseline}
          onChange={(f) => update('performanceBaseline', f)}
          placeholder="p50 280ms / p95 1.2s; +25ms target"
        />
      </Field>
      <Field label="Data residency" required>
        <UFInput
          field={spec.dataResidencyConstraints}
          onChange={(f) => update('dataResidencyConstraints', f)}
          rows={2}
          placeholder="EU data in eu-west-1; cross-region access denied"
        />
      </Field>
    </div>
  );
}

function ApiGatewayBlock({
  spec,
  onChange,
}: {
  spec: ApiGatewaySpec;
  onChange: (n: ApiGatewaySpec) => void;
}) {
  const update = <K extends keyof ApiGatewaySpec>(key: K, next: ApiGatewaySpec[K]) =>
    onChange({ ...spec, [key]: next });
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <Field label="API specs" required hint="OpenAPI / Swagger URLs for every API in scope.">
        <UrlList
          entries={spec.apiCatalogUrls}
          onChange={(next) => update('apiCatalogUrls', next)}
          labelPlaceholder="Accounts API v2"
          placeholder="https://api.example.com/swagger.json"
        />
      </Field>
      <Field
        label="Resource model"
        required
        hint="Path/query/body fields that drive authorization, per endpoint."
      >
        <UFInput
          field={spec.endpointResourceModel}
          onChange={(f) => update('endpointResourceModel', f)}
          rows={3}
          placeholder="/accounts/{accountId} → resource=account; /transfers POST checks fromAccountId+toAccountId"
        />
      </Field>
      <Field label="Auth pattern" required hint="What authenticates today.">
        <UFInput
          field={spec.authPatternToday}
          onChange={(f) => update('authPatternToday', f)}
          rows={2}
          placeholder="End-user JWT (Bearer); validated by Apigee"
        />
      </Field>
      <Field label="Token flow" required hint="Issuer, claims, audience, lifetime.">
        <UFInput
          field={spec.tokenFlow}
          onChange={(f) => update('tokenFlow', f)}
          rows={2}
          placeholder="Ping issues; claims sub/groups[]/dept; aud=accounts-api; 1h"
        />
      </Field>
      <Field label="Gateway version" required>
        <UFInput
          field={spec.gatewayVersion}
          onChange={(f) => update('gatewayVersion', f)}
          placeholder="Apigee X 1.10"
        />
      </Field>
      <Field label="Existing policies" required hint="Rate limit, schema val, etc. — what stays.">
        <UFInput
          field={spec.existingPolicies}
          onChange={(f) => update('existingPolicies', f)}
          rows={2}
          placeholder="Rate limit + JWT validation stay; remove custom auth proxy"
        />
      </Field>
      <Field label="Backend trust model" required>
        <UFInput
          field={spec.backendTrustModel}
          onChange={(f) => update('backendTrustModel', f)}
          placeholder="Backend trusts gateway"
        />
      </Field>
      <Field label="Latency SLA" required>
        <UFInput
          field={spec.latencySla}
          onChange={(f) => update('latencySla', f)}
          placeholder="p99 ≤ 250ms; +30ms PlainID; fail-closed"
        />
      </Field>
    </div>
  );
}

function AiAuthBlock({ spec, onChange }: { spec: AiAuthSpec; onChange: (n: AiAuthSpec) => void }) {
  const update = <K extends keyof AiAuthSpec>(key: K, next: AiAuthSpec[K]) =>
    onChange({ ...spec, [key]: next });
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <Field label="Agent topology" required hint="Single, supervisor, LangGraph state machine.">
        <UFInput
          field={spec.agentTopology}
          onChange={(f) => update('agentTopology', f)}
          rows={2}
          placeholder="LangGraph supervisor + 3 sub-agents; ~12 tools"
        />
      </Field>
      <Field label="Tool specs" required hint="OpenAPI / Pydantic / MCP tool definitions.">
        <UrlList
          entries={spec.toolInventoryUrls}
          onChange={(next) => update('toolInventoryUrls', next)}
          labelPlaceholder="Tool registry"
        />
      </Field>
      <Field label="Tool effects" required hint="Read / write / external calls per tool.">
        <UFInput
          field={spec.toolInventoryNotes}
          onChange={(f) => update('toolInventoryNotes', f)}
          rows={3}
          placeholder="search_kb (read RAG); transfer_funds (write); send_email (external)"
        />
      </Field>
      <Field label="Identity propagation" required>
        <UFInput
          field={spec.callingIdentityPropagation}
          onChange={(f) => update('callingIdentityPropagation', f)}
          rows={2}
          placeholder="User JWT in Authorization header; reused for downstream calls"
        />
      </Field>
      <Field label="RAG sources" required hint="Vector DBs, corpus, chunk-level vs. doc-level.">
        <UFInput
          field={spec.ragSourcesInScope}
          onChange={(f) => update('ragSourcesInScope', f)}
          rows={2}
          placeholder="Pinecone index 'support-kb' (40k chunks); chunk-level filtering"
        />
      </Field>
      <Field label="Agent runtime" required>
        <UFInput
          field={spec.agentRuntime}
          onChange={(f) => update('agentRuntime', f)}
          rows={2}
          placeholder="LangServe behind ALB; OAuth2 to MCP servers"
        />
      </Field>
      <Field label="MCP transport" required>
        <UFInput
          field={spec.mcpTransport}
          onChange={(f) => update('mcpTransport', f)}
          placeholder="Streamable HTTP + bearer; mTLS in prod"
        />
      </Field>
      <Field label="LLM provider" required>
        <UFInput
          field={spec.llmProvider}
          onChange={(f) => update('llmProvider', f)}
          rows={2}
          placeholder="AWS Bedrock — Claude Opus; data stays in customer account"
        />
      </Field>
      <Field label="Failure mode" required hint="On DENY: refuse / retry constrained / fail to user.">
        <UFInput
          field={spec.failureModePolicy}
          onChange={(f) => update('failureModePolicy', f)}
          rows={2}
          placeholder="Refuse with explanation; log decision id"
        />
      </Field>
    </div>
  );
}

function ApplicationBlock({
  spec,
  onChange,
}: {
  spec: ApplicationSpec;
  onChange: (n: ApplicationSpec) => void;
}) {
  const update = <K extends keyof ApplicationSpec>(key: K, next: ApplicationSpec[K]) =>
    onChange({ ...spec, [key]: next });
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <Field label="Architecture" required hint="Monolith vs. microservices, framework, runtime.">
        <UFInput
          field={spec.appArchitecture}
          onChange={(f) => update('appArchitecture', f)}
          rows={2}
          placeholder="Spring Boot 3.2 monolith on JDK 21"
        />
      </Field>
      <Field
        label="Resource model"
        required
        hint="Entity hierarchy and propagation rules."
      >
        <UFInput
          field={spec.resourceModel}
          onChange={(f) => update('resourceModel', f)}
          rows={2}
          placeholder="Org → Dept → Team → Project; access propagates down"
        />
      </Field>
      <Field label="Existing authorization" required hint="What's there today; what gets replaced.">
        <UFInput
          field={spec.existingAuthorization}
          onChange={(f) => update('existingAuthorization', f)}
          rows={2}
          placeholder="@PreAuthorize + DB role check — both replaced"
        />
      </Field>
      <Field label="Session model" required>
        <UFInput
          field={spec.sessionModel}
          onChange={(f) => update('sessionModel', f)}
          rows={2}
          placeholder="JWT (1h); decision cache invalidates on refresh"
        />
      </Field>
      <Field label="Build & deploy" required hint="Build tool, CI, dependency approval.">
        <UFInput
          field={spec.buildDeploy}
          onChange={(f) => update('buildDeploy', f)}
          rows={2}
          placeholder="Maven; GitLab CI; PlainID dep already approved"
        />
      </Field>
      <Field
        label="Domain rules"
        hint="HCM matrix, residency, etc. Optional — skip if not applicable."
      >
        <UFInput
          field={spec.domainSpecificRules}
          onChange={(f) => update('domainSpecificRules', f)}
          rows={3}
          placeholder="HRBP sees L1–L3 own org; L1–L4 direct reports; never peers' L4"
        />
      </Field>
    </div>
  );
}

function IdentityBlock({
  spec,
  uc,
  allUseCases,
  onChange,
}: {
  spec: IdentitySpec;
  uc: UseCase;
  allUseCases: UseCase[];
  onChange: (n: IdentitySpec) => void;
}) {
  const update = <K extends keyof IdentitySpec>(key: K, next: IdentitySpec[K]) =>
    onChange({ ...spec, [key]: next });

  const candidates = allUseCases.filter(
    (other) =>
      other.id !== uc.id &&
      !DOWNSTREAM_AUTHORIZER_CATEGORIES.includes(other.category) &&
      CATEGORY_HAS_TECH_BLOCK[other.category],
  );

  const toggleDownstream = (id: string) => {
    const next = spec.downstreamAuthorizerUseCaseIds.includes(id)
      ? spec.downstreamAuthorizerUseCaseIds.filter((x) => x !== id)
      : [...spec.downstreamAuthorizerUseCaseIds, id];
    update('downstreamAuthorizerUseCaseIds', next);
  };

  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <Field
        label="Downstream authorizers"
        required
        hint="Identity work feeds policies enforced by other use cases — pick which."
      >
        {candidates.length === 0 ? (
          <div className="text-[11.5px] text-[var(--color-text-dim)] py-2">
            No other use cases with authorizers yet. Add one first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => {
              const selected = spec.downstreamAuthorizerUseCaseIds.includes(c.id);
              const auth = c.technicalSpec
                ? findAuthorizer(c.technicalSpec.authorizer.selectedAuthorizerId)
                : undefined;
              return (
                <button
                  key={c.id}
                  onClick={() => toggleDownstream(c.id)}
                  className={`text-left text-[11.5px] px-2.5 py-1.5 rounded border transition-colors ${
                    selected
                      ? 'bg-[var(--color-pill-accent-bg)] text-[var(--color-accent)] border-[var(--color-pill-accent-border)]'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                  }`}
                >
                  <div className="font-medium">{c.title || '(untitled)'}</div>
                  <div className="mono text-[9px] tracking-widest opacity-80">
                    {c.category.toUpperCase()} · {auth?.name ?? 'no authorizer'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Field>
      <Field label="Role inventory" required hint="Counts by source, naming conventions.">
        <UFInput
          field={spec.roleInventory}
          onChange={(f) => update('roleInventory', f)}
          rows={2}
          placeholder="~3,200 AD groups + 800 SailPoint roles"
        />
      </Field>
      <Field label="Group volume" required hint="Largest groups, deepest nesting.">
        <UFInput
          field={spec.groupMembershipVolume}
          onChange={(f) => update('groupMembershipVolume', f)}
          rows={2}
          placeholder="Largest ~12k members; deepest nesting 6 levels"
        />
      </Field>
      <Field label="Lifecycle (JML)" required>
        <UFInput
          field={spec.lifecycleIntegration}
          onChange={(f) => update('lifecycleIntegration', f)}
          rows={2}
          placeholder="SailPoint pushes JML to AD nightly; new hire <24h"
        />
      </Field>
      <Field label="Source of truth" required hint="Which system owns each attribute.">
        <UFInput
          field={spec.sourceOfTruthMapping}
          onChange={(f) => update('sourceOfTruthMapping', f)}
          rows={2}
          placeholder="employeeId/dept — Workday; AD groups — SailPoint"
        />
      </Field>
      <Field label="Federation" required>
        <UFInput
          field={spec.federationBoundaries}
          onChange={(f) => update('federationBoundaries', f)}
          rows={2}
          placeholder="3 AD forests; partners via SAML; EMEA has own SailPoint"
        />
      </Field>
    </div>
  );
}

function ComplianceBlock({
  spec,
  uc,
  allUseCases,
  onChange,
}: {
  spec: ComplianceSpec;
  uc: UseCase;
  allUseCases: UseCase[];
  onChange: (n: ComplianceSpec) => void;
}) {
  const update = <K extends keyof ComplianceSpec>(key: K, next: ComplianceSpec[K]) =>
    onChange({ ...spec, [key]: next });

  const candidates = allUseCases.filter(
    (other) =>
      other.id !== uc.id &&
      !DOWNSTREAM_AUTHORIZER_CATEGORIES.includes(other.category) &&
      CATEGORY_HAS_TECH_BLOCK[other.category],
  );

  const toggleDownstream = (id: string) => {
    const next = spec.downstreamAuthorizerUseCaseIds.includes(id)
      ? spec.downstreamAuthorizerUseCaseIds.filter((x) => x !== id)
      : [...spec.downstreamAuthorizerUseCaseIds, id];
    update('downstreamAuthorizerUseCaseIds', next);
  };

  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <Field
        label="Authorizers under audit"
        required
        hint="Audit applies across configured authorizers — pick which are in scope."
      >
        {candidates.length === 0 ? (
          <div className="text-[11.5px] text-[var(--color-text-dim)] py-2">
            No other use cases with authorizers yet.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => {
              const selected = spec.downstreamAuthorizerUseCaseIds.includes(c.id);
              const auth = c.technicalSpec
                ? findAuthorizer(c.technicalSpec.authorizer.selectedAuthorizerId)
                : undefined;
              return (
                <button
                  key={c.id}
                  onClick={() => toggleDownstream(c.id)}
                  className={`text-left text-[11.5px] px-2.5 py-1.5 rounded border transition-colors ${
                    selected
                      ? 'bg-[var(--color-pill-accent-bg)] text-[var(--color-accent)] border-[var(--color-pill-accent-border)]'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                  }`}
                >
                  <div className="font-medium">{c.title || '(untitled)'}</div>
                  <div className="mono text-[9px] tracking-widest opacity-80">
                    {c.category.toUpperCase()} · {auth?.name ?? 'no authorizer'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Field>
      <Field label="Regulations" required>
        <UFInput
          field={spec.regulationSet}
          onChange={(f) => update('regulationSet', f)}
          rows={2}
          placeholder="SOX, PCI-DSS L1, NYDFS Part 500"
        />
      </Field>
      <Field label="Audit pipeline" required hint="Where decisions go today.">
        <UFInput
          field={spec.existingAuditPipeline}
          onChange={(f) => update('existingAuditPipeline', f)}
          rows={2}
          placeholder="Splunk ingest; quarterly review via SailPoint"
        />
      </Field>
      <Field label="Retention" required>
        <UFInput
          field={spec.retentionRequirements}
          onChange={(f) => update('retentionRequirements', f)}
          placeholder="7 years immutable (SOX); 1y hot, 6y warm"
        />
      </Field>
      <Field
        label="Sample audit questions"
        required
        hint="3–5 real questions auditors have asked."
      >
        <UFInput
          field={spec.sampleAuditQuestions}
          onChange={(f) => update('sampleAuditQuestions', f)}
          rows={4}
          placeholder="Show every user who accessed SSN data in Q3 and the policy that granted access"
        />
      </Field>
      <Field label="Reviewer personas" required hint="Who runs audits, with what tools.">
        <UFInput
          field={spec.reviewerPersonas}
          onChange={(f) => update('reviewerPersonas', f)}
          rows={2}
          placeholder="Internal audit (Splunk); external auditor (read-only PAP)"
        />
      </Field>
    </div>
  );
}

// ============================================================
// Per-use-case container
// ============================================================
function UseCaseTechnicalCard({
  uc,
  index,
  allUseCases,
  inScopeAuthorizerIds,
  onUseCaseChange,
}: {
  uc: UseCase;
  index: number;
  allUseCases: UseCase[];
  inScopeAuthorizerIds: string[];
  onUseCaseChange: (next: UseCase) => void;
}) {
  // Click handler: scroll the matching Section 05 use case card into view,
  // then flash the accent border briefly so the SE sees where they landed.
  const editInUseCases = () => {
    const node = document.getElementById(`uc-${uc.id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    node.classList.add('!border-[var(--color-accent)]', 'bg-[var(--color-pill-accent-bg)]');
    window.setTimeout(() => {
      node.classList.remove('!border-[var(--color-accent)]', 'bg-[var(--color-pill-accent-bg)]');
    }, 1600);
  };

  if (!CATEGORY_HAS_TECH_BLOCK[uc.category]) {
    return (
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-4 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
            UC {index + 1}
          </span>
          <span className="text-[13px] font-medium">{uc.title || '(untitled)'}</span>
          <Pill>{uc.category.toUpperCase()}</Pill>
          <button
            type="button"
            onClick={editInUseCases}
            className="ml-auto text-[11.5px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            title="Scroll to this use case in Section 05"
          >
            ← Edit in Section 05
          </button>
        </div>
        <div className="text-[12px] text-[var(--color-text-dim)]">
          No technical spec for "Other" — reclassify if specs are needed.
        </div>
      </div>
    );
  }

  const spec = uc.technicalSpec;
  if (!spec) return null;

  const setSpec = (next: TechnicalSpec) =>
    onUseCaseChange({ ...uc, technicalSpec: next });

  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-4 mb-4">
      <header className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--color-border)]">
        <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
          UC {index + 1}
        </span>
        <span className="text-[14px] font-semibold">{uc.title || '(untitled)'}</span>
        <Pill tone="accent">{uc.category.toUpperCase()}</Pill>
        <button
          type="button"
          onClick={editInUseCases}
          className="ml-auto text-[11.5px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
          title="Scroll to this use case in Section 05"
        >
          ← Edit in Section 05
        </button>
      </header>

      <AuthorizerBlock
        uc={uc}
        spec={spec.authorizer}
        allUseCases={allUseCases}
        inScopeAuthorizerIds={inScopeAuthorizerIds}
        onChange={(next) => setSpec({ ...spec, authorizer: next })}
        onCopyFrom={(sourceId) => {
          const source = allUseCases.find((u) => u.id === sourceId);
          if (!source?.technicalSpec) return;
          setSpec({ ...spec, authorizer: { ...source.technicalSpec.authorizer } });
        }}
      />

      {uc.category === 'Data' && spec.data && (
        <DataBlock spec={spec.data} onChange={(next) => setSpec({ ...spec, data: next })} />
      )}
      {uc.category === 'API Gateway' && spec.apiGateway && (
        <ApiGatewayBlock
          spec={spec.apiGateway}
          onChange={(next) => setSpec({ ...spec, apiGateway: next })}
        />
      )}
      {uc.category === 'AI Authorization' && spec.aiAuth && (
        <AiAuthBlock spec={spec.aiAuth} onChange={(next) => setSpec({ ...spec, aiAuth: next })} />
      )}
      {uc.category === 'Application' && spec.application && (
        <ApplicationBlock
          spec={spec.application}
          onChange={(next) => setSpec({ ...spec, application: next })}
        />
      )}
      {uc.category === 'Identity' && spec.identity && (
        <IdentityBlock
          spec={spec.identity}
          uc={uc}
          allUseCases={allUseCases}
          onChange={(next) => setSpec({ ...spec, identity: next })}
        />
      )}
      {uc.category === 'Compliance' && spec.compliance && (
        <ComplianceBlock
          spec={spec.compliance}
          uc={uc}
          allUseCases={allUseCases}
          onChange={(next) => setSpec({ ...spec, compliance: next })}
        />
      )}
    </div>
  );
}

// ============================================================
// Top-level Technical Foundation section
// ============================================================
export function TechnicalSection({ poc, set }: SectionProps) {
  const updateUseCase = (next: UseCase) =>
    set({ useCases: poc.useCases.map((u) => (u.id === next.id ? next : u)) });

  const foundation = poc.technicalFoundation ?? emptyTechnicalFoundation();
  const setFoundation = (next: TechnicalFoundation) => set({ technicalFoundation: next });

  const techUseCases = poc.useCases.filter((u) => CATEGORY_HAS_TECH_BLOCK[u.category]);

  return (
    <SectionCard
      id="technical"
      number="06"
      title="Technical Foundation"
      description="Technical deployment details for each use case you defined in Section 05. The title, category, and authorizer come from there — edit those in Section 05; fill in the deployment specifics here."
      status={evaluateSection(poc, 'technical')}
    >
      <UniversalFoundationBlock foundation={foundation} onChange={setFoundation} />

      {poc.useCases.length === 0 && (
        <EmptyState
          title="No use cases yet"
          description="Technical Foundation cards appear here once you create use cases in Section 05. Each use case gets one card to fill in deployment details for the authorizer you picked."
        />
      )}
      {poc.useCases.length > 0 && techUseCases.length === 0 && (
        <EmptyState
          title="No technical-spec use cases"
          description="All use cases are 'Other'. Reclassify to add technical specs."
        />
      )}
      {poc.useCases.map((uc, i) => (
        <UseCaseTechnicalCard
          key={uc.id}
          uc={uc}
          index={i}
          allUseCases={poc.useCases}
          inScopeAuthorizerIds={poc.inScopeSystems
            .map((s) => s.authorizerId)
            .filter((id): id is string => !!id)}
          onUseCaseChange={updateUseCase}
        />
      ))}
    </SectionCard>
  );
}
