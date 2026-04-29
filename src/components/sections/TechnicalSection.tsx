import React from 'react';
import type {
  PocDocument,
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

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);

interface SectionProps {
  poc: PocDocument;
  set: (patch: Partial<PocDocument>) => void;
}

// ============================================================
// Reusable: Unknown-able field
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
          placeholder={field.unknown ? 'Marked as TBD — will be resolved during POC' : placeholder}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
          className={field.unknown ? 'opacity-50' : ''}
        />
      ) : (
        <input
          type="text"
          value={field.value}
          disabled={field.unknown}
          placeholder={field.unknown ? 'Marked as TBD — will be resolved during POC' : placeholder}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
          className={field.unknown ? 'opacity-50' : ''}
        />
      )}
      <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none mb-0">
        <input
          type="checkbox"
          checked={field.unknown}
          onChange={(e) => onChange({ ...field, unknown: e.target.checked })}
          className="!w-auto !h-auto m-0"
        />
        <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
          UNKNOWN — TBD
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
  addLabel = '+ Add URL',
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
              placeholder="Notes (optional)"
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
// Authorizer block
// ============================================================
function AuthorizerBlock({
  uc,
  spec,
  allUseCases,
  onChange,
  onCopyFrom,
}: {
  uc: UseCase;
  spec: AuthorizerSpec;
  allUseCases: UseCase[];
  onChange: (next: AuthorizerSpec) => void;
  onCopyFrom: (sourceUseCaseId: string) => void;
}) {
  const isDownstream = DOWNSTREAM_AUTHORIZER_CATEGORIES.includes(uc.category);

  // Other use cases sharing this category — candidates for "copy authorizer config from"
  const copyCandidates = allUseCases.filter(
    (other) =>
      other.id !== uc.id &&
      other.category === uc.category &&
      other.technicalSpec?.authorizer.selectedAuthorizerId === spec.selectedAuthorizerId &&
      other.technicalSpec?.authorizer.selectedAuthorizerId !== 'custom',
  );

  const setSelected = (authorizerId: string) => {
    const auth = findAuthorizer(authorizerId);
    // Auto-populate authorizerDocs with the catalog entry's docsUrl, but
    // only if the user hasn't already added URLs (don't trample edits).
    const docs =
      spec.authorizerDocs.length === 0 && auth?.docsUrl
        ? [
            {
              id: uid(),
              label: 'PlainID Authorizer Documentation',
              url: auth.docsUrl,
              notes: '',
            },
          ]
        : spec.authorizerDocs;
    onChange({ ...spec, selectedAuthorizerId: authorizerId, authorizerDocs: docs });
  };

  const updateField = (key: keyof AuthorizerSpec, next: UnknownableField) =>
    onChange({ ...spec, [key]: next });

  const catalogForCategory = authorizersForCategory(uc.category);
  const selectedEntry = findAuthorizer(spec.selectedAuthorizerId);

  if (isDownstream) {
    // Identity & Compliance don't pick their own authorizer — they reference
    // downstream ones from the same POC. Render a different block.
    return null; // handled by IdentityBlock / ComplianceBlock instead
  }

  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="mono text-[10px] tracking-widest text-[var(--color-accent)]">
          AUTHORIZER
        </span>
        {selectedEntry && (
          <Pill tone="neutral">{selectedEntry.enforcementMode.toUpperCase()}</Pill>
        )}
      </div>

      <Field
        label="Selected authorizer"
        required
        hint="Determines deployment topology, integration pattern, and the policies PlainID can express. Pick from the catalog or 'Other / Custom' to name an unsupported authorizer."
      >
        <select
          value={spec.selectedAuthorizerId}
          onChange={(e) => setSelected(e.target.value)}
        >
          {catalogForCategory.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value="custom">Other / Custom…</option>
        </select>
      </Field>

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
            placeholder="e.g. ‘Snowflake Authorizer (custom build)’ or vendor name"
          />
        </Field>
      )}

      {copyCandidates.length > 0 && (
        <div className="mb-4 -mt-2 flex items-center gap-2 flex-wrap">
          <span className="mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
            COPY AUTHORIZER CONFIG FROM
          </span>
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
        <Field
          label="Authorizer version"
          required
          hint="Pinned release version for the POC."
        >
          <UFInput
            field={spec.version}
            onChange={(f) => updateField('version', f)}
            placeholder="e.g. 4.5.2"
          />
        </Field>
        <Field
          label="Enforcement mode"
          required
          hint="Inline proxy / native target-system policy / SDK / plugin."
        >
          <UFInput
            field={spec.enforcementMode}
            onChange={(f) => updateField('enforcementMode', f)}
            placeholder="e.g. Proxy (inline) — intercepts JDBC traffic"
          />
        </Field>
        <Field
          label="Deployment topology"
          required
          hint="Helm/K8s, Docker standalone, AWS Lambda, plugin install, etc."
        >
          <UFInput
            field={spec.deploymentTopology}
            onChange={(f) => updateField('deploymentTopology', f)}
            placeholder="e.g. Helm chart in customer K8s cluster"
          />
        </Field>
        <Field
          label="Deployment target"
          required
          hint="Which infrastructure: customer cluster, AWS account, Snowflake account, Apigee org…"
        >
          <UFInput
            field={spec.deploymentTarget}
            onChange={(f) => updateField('deploymentTarget', f)}
            placeholder="e.g. customer EKS cluster (us-east-1)"
          />
        </Field>
        <Field
          label="PDP endpoint"
          required
          hint="URL the authorizer calls to get decisions."
        >
          <UFInput
            field={spec.pdpEndpoint}
            onChange={(f) => updateField('pdpEndpoint', f)}
            placeholder="e.g. https://runtime.<tenant>.plainid.io/api/runtime/resolution/v3"
          />
        </Field>
        <Field
          label="Network path"
          required
          hint="Direct internet, PrivateLink, VPN, transit gateway."
        >
          <UFInput
            field={spec.networkPath}
            onChange={(f) => updateField('networkPath', f)}
            placeholder="e.g. PrivateLink to PlainID SaaS in us-east-1"
          />
        </Field>
        <Field
          label="Identity source paths"
          required
          hint="Hostnames/ports/auth methods for IdP, IGA, directory."
        >
          <UFInput
            field={spec.identitySourcePaths}
            onChange={(f) => updateField('identitySourcePaths', f)}
            rows={2}
            placeholder="e.g. ldaps://ad.corp.example.com:636 (svc account); https://ping.example.com (OIDC)"
          />
        </Field>
        <Field
          label="Required PIP integrations"
          required
          hint="Identity sources that must be wired for this authorizer to resolve identity claims."
        >
          <UFInput
            field={spec.requiredPipIntegrations}
            onChange={(f) => updateField('requiredPipIntegrations', f)}
            rows={2}
            placeholder="e.g. AD groups (LDAP), SailPoint role catalog (REST)"
          />
        </Field>
        <Field label="Credentials location" required hint="Where secrets live.">
          <UFInput
            field={spec.credentialsLocation}
            onChange={(f) => updateField('credentialsLocation', f)}
            placeholder="e.g. AWS Secrets Manager / HashiCorp Vault / K8s secret"
          />
        </Field>
        <Field label="Credentials provisioner" required hint="Who creates and rotates them.">
          <UFInput
            field={spec.credentialsProvisioner}
            onChange={(f) => updateField('credentialsProvisioner', f)}
            placeholder="e.g. customer Platform team"
          />
        </Field>
        <Field
          label="Failure mode"
          required
          hint="Behavior when PDP unreachable: fail-open / fail-closed / cache TTL."
        >
          <UFInput
            field={spec.failureMode}
            onChange={(f) => updateField('failureMode', f)}
            placeholder="e.g. Fail-closed; 30s decision cache"
          />
        </Field>
        <Field
          label="Performance budget"
          required
          hint="Acceptable latency overhead introduced by the authorizer."
        >
          <UFInput
            field={spec.performanceBudget}
            onChange={(f) => updateField('performanceBudget', f)}
            placeholder="e.g. < 25ms p99 added to query latency"
          />
        </Field>
      </div>

      <Field
        label="Sample request / response"
        hint="For query-modifying or token-enriching authorizers, the before/after for at least one realistic example. Helps customer architects validate the integration."
      >
        <UFInput
          field={spec.sampleRequestResponse}
          onChange={(f) => updateField('sampleRequestResponse', f)}
          rows={4}
          placeholder="Original SQL: SELECT * FROM clients;\nAuthorized SQL: SELECT name, region FROM clients WHERE region='US';"
        />
      </Field>

      <Field
        label="Authorizer documentation"
        hint="Auto-populated from the selected authorizer. Add additional links as needed (e.g. customer-internal runbooks)."
      >
        <UrlList
          entries={spec.authorizerDocs}
          onChange={(next) => onChange({ ...spec, authorizerDocs: next })}
          labelPlaceholder="e.g. Deployment Guide"
          addLabel="+ Add doc URL"
        />
      </Field>

      <Field
        label="Open items / TBDs"
        hint="Specific authorizer-related questions that need to be resolved during the POC."
      >
        <UFInput
          field={spec.openItems}
          onChange={(f) => updateField('openItems', f)}
          rows={3}
          placeholder="e.g. Confirm whether customer's network policy permits egress to PlainID SaaS PrivateLink endpoint"
        />
      </Field>
    </div>
  );
}

// ============================================================
// Per-category blocks
// ============================================================
function DataBlock({
  spec,
  onChange,
}: {
  spec: DataSpec;
  onChange: (next: DataSpec) => void;
}) {
  const update = <K extends keyof DataSpec>(key: K, next: DataSpec[K]) =>
    onChange({ ...spec, [key]: next });
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <div className="mono text-[10px] tracking-widest text-[var(--color-text-muted)] mb-3">
        DATA LAYER SPECIFICS
      </div>
      <Field
        label="Data catalog scope"
        required
        hint="Catalogs, schemas, tables/views in scope, approximate row counts."
      >
        <UFInput
          field={spec.catalogScope}
          onChange={(f) => update('catalogScope', f)}
          rows={3}
          placeholder="e.g. catalog 'prod' / schema 'sales' / 12 tables / ~80M rows"
        />
      </Field>
      <Field
        label="Classification taxonomy"
        required
        hint="Existing scheme (L1–L5, PII/PHI/PCI tags, etc.) and where it lives (table comments, Unity Catalog tags, external system)."
      >
        <UFInput
          field={spec.classificationTaxonomy}
          onChange={(f) => update('classificationTaxonomy', f)}
          rows={3}
          placeholder="e.g. L1 Public, L2 Internal, L3 Confidential, L4 Restricted, L5 Highly Restricted — stored as Unity Catalog tags"
        />
      </Field>
      <Field
        label="Classification documentation"
        hint="Links to the customer's data classification policy or scheme."
      >
        <UrlList
          entries={spec.classificationDocsUrls}
          onChange={(next) => update('classificationDocsUrls', next)}
          labelPlaceholder="e.g. Internal data class policy"
        />
      </Field>
      <Field
        label="Sample queries"
        required
        hint="3–5 real queries representing common access patterns (joins, aggregates, views)."
      >
        <UFInput
          field={spec.sampleQueries}
          onChange={(f) => update('sampleQueries', f)}
          rows={5}
          placeholder="-- Account summary by region&#10;SELECT region, SUM(balance) FROM accounts WHERE status='active' GROUP BY region;"
        />
      </Field>
      <Field
        label="Connection method"
        required
        hint="JDBC driver version, connection pooler, workspace token vs. service principal."
      >
        <UFInput
          field={spec.connectionMethod}
          onChange={(f) => update('connectionMethod', f)}
          rows={2}
          placeholder="e.g. Databricks JDBC 2.6.40 via service principal; PgBouncer in transaction pooling mode"
        />
      </Field>
      <Field
        label="Existing access control"
        required
        hint="What's enforced today (Unity Catalog grants, row filters, dynamic views, custom procs); what stays vs. gets replaced."
      >
        <UFInput
          field={spec.existingAccessControl}
          onChange={(f) => update('existingAccessControl', f)}
          rows={3}
          placeholder="e.g. Unity Catalog GRANTs at table-level; legacy view-based row filtering — both replaced by PlainID"
        />
      </Field>
      <Field
        label="Performance baseline"
        required
        hint="Current query latency p50/p95, target with PlainID in path."
      >
        <UFInput
          field={spec.performanceBaseline}
          onChange={(f) => update('performanceBaseline', f)}
          placeholder="e.g. p50 280ms / p95 1.2s; target +25ms p95 with authorizer"
        />
      </Field>
      <Field
        label="Data residency constraints"
        required
        hint="Regions, cross-region replication, what triggers a residency check."
      >
        <UFInput
          field={spec.dataResidencyConstraints}
          onChange={(f) => update('dataResidencyConstraints', f)}
          rows={2}
          placeholder="e.g. EU customer data must stay in eu-west-1; US data in us-east-1; cross-region access denied by default"
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
  onChange: (next: ApiGatewaySpec) => void;
}) {
  const update = <K extends keyof ApiGatewaySpec>(key: K, next: ApiGatewaySpec[K]) =>
    onChange({ ...spec, [key]: next });
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <div className="mono text-[10px] tracking-widest text-[var(--color-text-muted)] mb-3">
        API GATEWAY SPECIFICS
      </div>
      <Field
        label="API specifications"
        required
        hint="OpenAPI / Swagger URLs for every API in scope. PlainID needs these to map endpoints to authorization decisions."
      >
        <UrlList
          entries={spec.apiCatalogUrls}
          onChange={(next) => update('apiCatalogUrls', next)}
          labelPlaceholder="e.g. Accounts API v2 (Swagger)"
          placeholder="https://api.example.com/swagger.json"
        />
      </Field>
      <Field
        label="Endpoint resource model"
        required
        hint="For each API: resource type, path parameters, query parameters and request body fields that drive authorization."
      >
        <UFInput
          field={spec.endpointResourceModel}
          onChange={(f) => update('endpointResourceModel', f)}
          rows={4}
          placeholder="e.g. /accounts/{accountId} → resource=account, scopes from token; /transfers POST body.fromAccountId/toAccountId both checked"
        />
      </Field>
      <Field
        label="Auth pattern today"
        required
        hint="API key, OAuth client credentials, end-user JWT pass-through, mTLS, custom headers."
      >
        <UFInput
          field={spec.authPatternToday}
          onChange={(f) => update('authPatternToday', f)}
          rows={2}
          placeholder="e.g. End-user JWT in Authorization header (Bearer); validated by Apigee then passed to backend"
        />
      </Field>
      <Field
        label="Token flow"
        required
        hint="Issuer, claims structure, audience values, token lifetime, refresh behavior."
      >
        <UFInput
          field={spec.tokenFlow}
          onChange={(f) => update('tokenFlow', f)}
          rows={3}
          placeholder="e.g. Issued by Ping (PingFederate); claims: sub, groups[], dept, region; aud='accounts-api'; 1h lifetime"
        />
      </Field>
      <Field
        label="Gateway version & plugin compatibility"
        required
        hint="Apigee X vs. Edge, Kong OSS vs. Enterprise, plugin SDK version."
      >
        <UFInput
          field={spec.gatewayVersion}
          onChange={(f) => update('gatewayVersion', f)}
          placeholder="e.g. Apigee X / 1.10; PlainID Apigee Authorizer plugin v3.x"
        />
      </Field>
      <Field
        label="Existing gateway policies"
        required
        hint="Rate limiting, schema validation, transformation — what stays in place."
      >
        <UFInput
          field={spec.existingPolicies}
          onChange={(f) => update('existingPolicies', f)}
          rows={2}
          placeholder="e.g. Rate limit (10k/min) and JWT validation stay; remove custom auth proxy"
        />
      </Field>
      <Field
        label="Backend trust model"
        required
        hint="Is the backend zero-trust (validates everything) or trusts the gateway?"
      >
        <UFInput
          field={spec.backendTrustModel}
          onChange={(f) => update('backendTrustModel', f)}
          placeholder="e.g. Trust gateway: backend assumes JWT already validated and authorization already passed"
        />
      </Field>
      <Field
        label="Latency SLA"
        required
        hint="Current API p99 and acceptable PlainID overhead; fail-open vs. fail-closed."
      >
        <UFInput
          field={spec.latencySla}
          onChange={(f) => update('latencySla', f)}
          placeholder="e.g. p99 ≤ 250ms; max +30ms PlainID overhead; fail-closed"
        />
      </Field>
    </div>
  );
}

function AiAuthBlock({
  spec,
  onChange,
}: {
  spec: AiAuthSpec;
  onChange: (next: AiAuthSpec) => void;
}) {
  const update = <K extends keyof AiAuthSpec>(key: K, next: AiAuthSpec[K]) =>
    onChange({ ...spec, [key]: next });
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <div className="mono text-[10px] tracking-widest text-[var(--color-text-muted)] mb-3">
        AI AUTHORIZATION SPECIFICS
      </div>
      <Field
        label="Agent topology"
        required
        hint="Single agent / multi-agent supervisor / LangGraph state machine; tool catalog scope."
      >
        <UFInput
          field={spec.agentTopology}
          onChange={(f) => update('agentTopology', f)}
          rows={2}
          placeholder="e.g. LangGraph supervisor agent with 3 specialized sub-agents; ~12 tools total"
        />
      </Field>
      <Field
        label="Tool inventory specifications"
        required
        hint="Specs for tools/functions the agent can invoke (OpenAPI, Pydantic, MCP tool defs)."
      >
        <UrlList
          entries={spec.toolInventoryUrls}
          onChange={(next) => update('toolInventoryUrls', next)}
          labelPlaceholder="e.g. Tool registry export"
          placeholder="https://repo.example.com/tools.json"
        />
      </Field>
      <Field
        label="Tool inventory notes"
        required
        hint="Each tool's downstream side effects (read, write, external calls)."
      >
        <UFInput
          field={spec.toolInventoryNotes}
          onChange={(f) => update('toolInventoryNotes', f)}
          rows={4}
          placeholder="e.g. search_kb (read RAG); transfer_funds (write, calls payments API); send_email (external write)"
        />
      </Field>
      <Field
        label="Calling identity propagation"
        required
        hint="How the user's JWT reaches the agent (header pass-through, ambient context, A2A delegation)."
      >
        <UFInput
          field={spec.callingIdentityPropagation}
          onChange={(f) => update('callingIdentityPropagation', f)}
          rows={2}
          placeholder="e.g. End-user JWT passed via Authorization header; agent re-uses it for downstream tool calls"
        />
      </Field>
      <Field
        label="RAG sources in scope"
        required
        hint="Vector DB(s), document corpus, classification on embedded chunks, chunk-level vs. doc-level authorization."
      >
        <UFInput
          field={spec.ragSourcesInScope}
          onChange={(f) => update('ragSourcesInScope', f)}
          rows={3}
          placeholder="e.g. Pinecone index 'support-kb' (40k chunks); each chunk tagged with source-doc classification; chunk-level filtering"
        />
      </Field>
      <Field
        label="Agent runtime"
        required
        hint="LangServe, custom FastAPI, AWS Bedrock Agents, runtime authentication to MCP servers."
      >
        <UFInput
          field={spec.agentRuntime}
          onChange={(f) => update('agentRuntime', f)}
          rows={2}
          placeholder="e.g. LangServe behind ALB; OAuth2 client-credentials to internal MCP servers"
        />
      </Field>
      <Field
        label="MCP transport"
        required
        hint="stdio / SSE / streamable HTTP; auth pattern (bearer, mTLS, none)."
      >
        <UFInput
          field={spec.mcpTransport}
          onChange={(f) => update('mcpTransport', f)}
          placeholder="e.g. Streamable HTTP with bearer token; mTLS for prod"
        />
      </Field>
      <Field
        label="LLM provider"
        required
        hint="Model, API key scope, rate limits, what data crosses provider boundary."
      >
        <UFInput
          field={spec.llmProvider}
          onChange={(f) => update('llmProvider', f)}
          rows={2}
          placeholder="e.g. AWS Bedrock — Claude Opus; data stays in customer AWS account; no third-party data egress"
        />
      </Field>
      <Field
        label="Failure mode policy"
        required
        hint="What does the agent do on PlainID DENY (refuse, retry with constrained tools, fail to user)."
      >
        <UFInput
          field={spec.failureModePolicy}
          onChange={(f) => update('failureModePolicy', f)}
          rows={2}
          placeholder="e.g. Refuse with explanation; do NOT retry with different tool; log decision id for audit"
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
  onChange: (next: ApplicationSpec) => void;
}) {
  const update = <K extends keyof ApplicationSpec>(key: K, next: ApplicationSpec[K]) =>
    onChange({ ...spec, [key]: next });
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <div className="mono text-[10px] tracking-widest text-[var(--color-text-muted)] mb-3">
        APPLICATION SPECIFICS
      </div>
      <Field
        label="Application architecture"
        required
        hint="Monolith vs. microservices, framework version (Spring Boot 2 vs. 3), JVM version."
      >
        <UFInput
          field={spec.appArchitecture}
          onChange={(f) => update('appArchitecture', f)}
          rows={2}
          placeholder="e.g. Spring Boot 3.2 monolith on JDK 21; deployed as fat jar to on-prem JVM"
        />
      </Field>
      <Field
        label="Resource model"
        required
        hint="Entity hierarchy, ownership relationships, parent-child propagation rules."
      >
        <UFInput
          field={spec.resourceModel}
          onChange={(f) => update('resourceModel', f)}
          rows={3}
          placeholder="e.g. Org → Department → Team → Project → Task; access propagates down by default; explicit overrides allowed"
        />
      </Field>
      <Field
        label="Existing authorization"
        required
        hint="Annotations, custom interceptors, role tables in DB, what gets replaced vs. wrapped."
      >
        <UFInput
          field={spec.existingAuthorization}
          onChange={(f) => update('existingAuthorization', f)}
          rows={3}
          placeholder="e.g. @PreAuthorize annotations + custom DB role check; both replaced by PlainID Spring SDK calls"
        />
      </Field>
      <Field
        label="Session model"
        required
        hint="Stateful sessions, JWT-only, when does authorization context refresh."
      >
        <UFInput
          field={spec.sessionModel}
          onChange={(f) => update('sessionModel', f)}
          rows={2}
          placeholder="e.g. JWT sessions (1h); decision cache invalidated on token refresh"
        />
      </Field>
      <Field
        label="Build / deploy"
        required
        hint="Maven/Gradle, CI/CD pipeline, deployment targets, can we add a dependency without security review?"
      >
        <UFInput
          field={spec.buildDeploy}
          onChange={(f) => update('buildDeploy', f)}
          rows={2}
          placeholder="e.g. Maven; GitLab CI; security review needed for new deps — already approved for PlainID Spring SDK"
        />
      </Field>
      <Field
        label="Domain-specific rules"
        hint="HCM role matrix × sensitivity tier, residency-by-jurisdiction, etc. Specific to the application's domain."
      >
        <UFInput
          field={spec.domainSpecificRules}
          onChange={(f) => update('domainSpecificRules', f)}
          rows={4}
          placeholder="e.g. HRBP can see L1-L3 for own org; L1-L4 for direct reports; never own peers' L4 data"
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
  onChange: (next: IdentitySpec) => void;
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
      <div className="mono text-[10px] tracking-widest text-[var(--color-text-muted)] mb-3">
        IDENTITY SPECIFICS
      </div>
      <Field
        label="Downstream authorizers"
        required
        hint="Identity / role consolidation feeds policies that ultimately get enforced by other authorizers in the POC. Pick which ones."
      >
        {candidates.length === 0 ? (
          <div className="text-[11.5px] text-[var(--color-text-dim)] py-2">
            No other use cases with authorizers in this POC yet. Add a Data, API Gateway, AI
            Authorization, or Application use case first.
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
      <Field label="Role inventory" required>
        <UFInput
          field={spec.roleInventory}
          onChange={(f) => update('roleInventory', f)}
          rows={3}
          placeholder="e.g. ~3,200 AD groups + 800 SailPoint roles + 120 LDAP groups; naming conventions inconsistent across systems"
        />
      </Field>
      <Field label="Group membership volume" required>
        <UFInput
          field={spec.groupMembershipVolume}
          onChange={(f) => update('groupMembershipVolume', f)}
          rows={2}
          placeholder="e.g. Largest group ~12k members; deepest nesting 6 levels; transitive resolved at logon"
        />
      </Field>
      <Field label="Lifecycle integration" required>
        <UFInput
          field={spec.lifecycleIntegration}
          onChange={(f) => update('lifecycleIntegration', f)}
          rows={2}
          placeholder="e.g. SailPoint pushes JML events to AD nightly; new hire access available within 24h of HR start date"
        />
      </Field>
      <Field label="Source-of-truth mapping" required>
        <UFInput
          field={spec.sourceOfTruthMapping}
          onChange={(f) => update('sourceOfTruthMapping', f)}
          rows={3}
          placeholder="e.g. employeeId — Workday; department — Workday; AD groups — SailPoint owns; LDAP — read-only mirror of AD"
        />
      </Field>
      <Field label="Federation boundaries" required>
        <UFInput
          field={spec.federationBoundaries}
          onChange={(f) => update('federationBoundaries', f)}
          rows={2}
          placeholder="e.g. 3 AD forests; partner orgs federate via SAML; subsidiary in EMEA has its own SailPoint"
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
  onChange: (next: ComplianceSpec) => void;
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
      <div className="mono text-[10px] tracking-widest text-[var(--color-text-muted)] mb-3">
        COMPLIANCE SPECIFICS
      </div>
      <Field
        label="Authorizers under audit"
        required
        hint="Compliance / audit applies across all configured authorizers. Pick which ones are in scope for this audit use case."
      >
        {candidates.length === 0 ? (
          <div className="text-[11.5px] text-[var(--color-text-dim)] py-2">
            No other use cases with authorizers in this POC yet.
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
      <Field label="Regulation set" required hint="SOX, PCI-DSS, HIPAA, GDPR, CCPA, sector-specific.">
        <UFInput
          field={spec.regulationSet}
          onChange={(f) => update('regulationSet', f)}
          rows={2}
          placeholder="e.g. SOX (annual), PCI-DSS Level 1, NYDFS Part 500"
        />
      </Field>
      <Field label="Existing audit pipeline" required>
        <UFInput
          field={spec.existingAuditPipeline}
          onChange={(f) => update('existingAuditPipeline', f)}
          rows={3}
          placeholder="e.g. Decision logs ship to Splunk; quarterly access review via SailPoint; ad-hoc queries via SOC2 portal"
        />
      </Field>
      <Field label="Retention requirements" required>
        <UFInput
          field={spec.retentionRequirements}
          onChange={(f) => update('retentionRequirements', f)}
          placeholder="e.g. 7 years immutable (SOX); 1 year hot, 6 years warm (S3 Object Lock)"
        />
      </Field>
      <Field
        label="Sample audit questions"
        required
        hint="3–5 real questions auditors have asked. Concrete examples beat abstract requirements."
      >
        <UFInput
          field={spec.sampleAuditQuestions}
          onChange={(f) => update('sampleAuditQuestions', f)}
          rows={5}
          placeholder="e.g. ‘Show me every user who accessed Customer SSN data in Q3 and the policy that granted access’"
        />
      </Field>
      <Field label="Reviewer personas" required>
        <UFInput
          field={spec.reviewerPersonas}
          onChange={(f) => update('reviewerPersonas', f)}
          rows={2}
          placeholder="e.g. Internal audit (uses Splunk + spreadsheets); external auditor (read-only PAP access); compliance officer (PAP with policy ownership)"
        />
      </Field>
    </div>
  );
}

// ============================================================
// Universal block (always shown when category has a tech block)
// ============================================================
function UniversalBlock({
  spec,
  onChange,
}: {
  spec: TechnicalSpec;
  onChange: (next: TechnicalSpec) => void;
}) {
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 mb-4">
      <div className="mono text-[10px] tracking-widest text-[var(--color-text-muted)] mb-3">
        UNIVERSAL — IDENTITY & TEST USERS
      </div>
      <Field
        label="JWT / OIDC token samples"
        required
        hint="Decoded JWT samples or links to token introspection. PlainID needs to see the actual claim shape."
      >
        <UrlList
          entries={spec.jwtSampleUrls}
          onChange={(next) => onChange({ ...spec, jwtSampleUrls: next })}
          labelPlaceholder="e.g. Sample employee JWT (jwt.io)"
        />
      </Field>
      <Field
        label="Identity attribute catalog"
        required
        hint="Attributes available from IdP/AD/IGA, types, example values, refresh cadence."
      >
        <UFInput
          field={spec.identityAttributeCatalog}
          onChange={(f) => onChange({ ...spec, identityAttributeCatalog: f })}
          rows={4}
          placeholder="e.g. employeeId (string), department (string), groups (array), clearance (enum: L1-L5), region (string); refreshed on token issue (1h)"
        />
      </Field>
      <Field
        label="Test user accounts"
        required
        hint="Min 3-5 accounts representing different attribute combinations; provisioning owner; how PlainID gets access."
      >
        <UFInput
          field={spec.testUserAccounts}
          onChange={(f) => onChange({ ...spec, testUserAccounts: f })}
          rows={4}
          placeholder="e.g. 5 accounts in customer test IdP, 1 per persona; provisioned by IAM team; creds in shared 1Password vault"
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
  onUseCaseChange,
}: {
  uc: UseCase;
  index: number;
  allUseCases: UseCase[];
  onUseCaseChange: (next: UseCase) => void;
}) {
  if (!CATEGORY_HAS_TECH_BLOCK[uc.category]) {
    // Category 'Other' has no tech block — just a placeholder note.
    return (
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="mono text-[11px] text-[var(--color-text-dim)] tracking-widest">
            UC{String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-[13px] font-medium">{uc.title || '(untitled)'}</span>
          <Pill>{uc.category.toUpperCase()}</Pill>
        </div>
        <div className="text-[12px] text-[var(--color-text-dim)]">
          No technical spec block for category "Other". Reclassify the use case if technical
          details are needed.
        </div>
      </div>
    );
  }

  // Ensure the use case has a tech spec (shouldn't happen post-migration, but defensively)
  const spec = uc.technicalSpec;
  if (!spec) {
    return null;
  }

  const setSpec = (next: TechnicalSpec) =>
    onUseCaseChange({ ...uc, technicalSpec: next });

  const isDownstreamCategory = DOWNSTREAM_AUTHORIZER_CATEGORIES.includes(uc.category);

  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-4 mb-4">
      <header className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--color-border)]">
        <span className="mono text-[11px] text-[var(--color-text-dim)] tracking-widest">
          UC{String(index + 1).padStart(2, '0')}
        </span>
        <span className="text-[14px] font-semibold">{uc.title || '(untitled)'}</span>
        <Pill tone="accent">{uc.category.toUpperCase()}</Pill>
      </header>

      {!isDownstreamCategory && (
        <AuthorizerBlock
          uc={uc}
          spec={spec.authorizer}
          allUseCases={allUseCases}
          onChange={(next) => setSpec({ ...spec, authorizer: next })}
          onCopyFrom={(sourceId) => {
            const source = allUseCases.find((u) => u.id === sourceId);
            if (!source?.technicalSpec) return;
            setSpec({ ...spec, authorizer: { ...source.technicalSpec.authorizer } });
          }}
        />
      )}

      <UniversalBlock spec={spec} onChange={setSpec} />

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

  const techUseCases = poc.useCases.filter((u) => CATEGORY_HAS_TECH_BLOCK[u.category]);

  return (
    <SectionCard
      id="technical"
      number="06"
      title="Technical Foundation"
      description="Authorizer selection plus the technical specifics PlainID needs to map identity, build policies, and integrate with target systems. Each use case gets its own authorizer config and category-specific block. Mark fields TBD when answers aren't yet known."
      status={evaluateSection(poc, 'technical')}
    >
      {poc.useCases.length === 0 && (
        <EmptyState
          title="No use cases yet"
          description="Add use cases in Section 05 first. Each use case gets a corresponding technical spec block here."
        />
      )}
      {poc.useCases.length > 0 && techUseCases.length === 0 && (
        <EmptyState
          title="No technical-spec use cases"
          description="All use cases are categorized as 'Other'. Reclassify them to surface technical spec blocks."
        />
      )}
      {poc.useCases.map((uc, i) => (
        <UseCaseTechnicalCard
          key={uc.id}
          uc={uc}
          index={i}
          allUseCases={poc.useCases}
          onUseCaseChange={updateUseCase}
        />
      ))}
    </SectionCard>
  );
}
