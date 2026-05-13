import type { PocDocument, UseCase } from '../types';
import { findAuthorizer } from '../types';

/**
 * Prompt templates for AI features. Centralized so we can iterate on phrasing
 * without hunting through components, and so each prompt's context-shape is
 * obvious.
 *
 * Style decisions:
 * - System prompts are short and grounded ("you are an SE at PlainID...").
 * - User prompts include only the relevant fields, not the whole POC, to
 *   keep token counts reasonable.
 * - We instruct the model to return prose, not Markdown — the field is
 *   plain text, so headers/bullets would render as literal characters.
 */

const SE_SYSTEM = `You are a senior Solutions Engineer at PlainID, a policy-based access control (PBAC) and authorization platform. You help PlainID SEs draft Proof of Concept (POC) documents for enterprise customers. You are technically precise, concise, and avoid marketing fluff. You write in clear professional prose suitable for an enterprise customer audience. You do not invent facts about specific customers — when context is sparse, you write reasonable industry-typical content with placeholder phrasing the SE can refine.`;

interface FieldContext {
  customerName?: string;
  customerIndustry?: string;
  customerOverview?: string;
  useCaseTitles?: string[];
  inScopeSystems?: string[];
}

function contextBlock(c: FieldContext): string {
  const parts: string[] = [];
  if (c.customerName) parts.push(`Customer: ${c.customerName}`);
  if (c.customerIndustry) parts.push(`Industry: ${c.customerIndustry}`);
  if (c.customerOverview) parts.push(`Customer overview: ${c.customerOverview}`);
  if (c.useCaseTitles && c.useCaseTitles.length > 0)
    parts.push(`POC use cases: ${c.useCaseTitles.join('; ')}`);
  if (c.inScopeSystems && c.inScopeSystems.length > 0)
    parts.push(`In-scope systems: ${c.inScopeSystems.join('; ')}`);
  return parts.length > 0 ? `Context:\n${parts.join('\n')}\n\n` : '';
}

function gatherFieldContext(poc: PocDocument): FieldContext {
  return {
    customerName: poc.customerName || undefined,
    customerIndustry: poc.customerIndustry || undefined,
    customerOverview: poc.customerOverview?.slice(0, 600) || undefined,
    useCaseTitles: poc.useCases.map((u) => u.title).filter(Boolean),
    inScopeSystems: poc.inScopeSystems
      .map((s) => `${s.name}${s.focus ? ` (${s.focus})` : ''}`)
      .filter(Boolean),
  };
}

// ---------------------------------------------------------------------
// Field-level suggest
// ---------------------------------------------------------------------

export interface FieldPrompt {
  fieldKey: string;
  label: string;
  description: string;
  // Format guidance fed to the model
  format: string;
  // Approx max tokens for the output
  maxTokens: number;
}

export const FIELD_PROMPTS: Record<string, FieldPrompt> = {
  customerOverview: {
    fieldKey: 'customerOverview',
    label: 'Customer Overview',
    description: 'A factual 2–3 sentence overview of the customer organization.',
    format:
      'Plain prose, 2–3 sentences. Focus on what the company does, scale, and any well-known facts. If facts are unknown, write industry-typical phrasing the SE can edit.',
    maxTokens: 400,
  },
  compellingEvent: {
    fieldKey: 'compellingEvent',
    label: 'Compelling Event',
    description:
      'What is forcing the customer to evaluate authorization NOW (regulatory deadline, modernization milestone, audit finding, breach response, M&A, etc.)?',
    format:
      'Plain prose, 1 short paragraph (3–5 sentences). Concrete and specific. If unknown, propose 1–2 plausible drivers based on industry context.',
    maxTokens: 500,
  },
  authorizationContext: {
    fieldKey: 'authorizationContext',
    label: 'Authorization Context',
    description:
      "Where the customer is today regarding authorization: what's deployed, what's broken, what they're trying to evolve toward.",
    format:
      'Plain prose, 1–2 short paragraphs. Cover current state (often: scattered RBAC, hard-coded checks, role explosion) and target state (centralized PBAC).',
    maxTokens: 600,
  },
  objectives: {
    fieldKey: 'objectives',
    label: 'Objectives',
    description: 'Specific, measurable POC objectives.',
    format:
      'Plain prose paragraph followed by a list of 4–6 concrete objectives, one per line, no bullets, no numbering.',
    maxTokens: 600,
  },
  whatToValidate: {
    fieldKey: 'whatToValidate',
    label: 'What Customer Will Validate',
    description: 'The specific success criteria the customer will validate during the POC.',
    format:
      'A list of 4–6 concrete validation criteria, one per line, no bullets. Each should describe an observable outcome.',
    maxTokens: 500,
  },
  postPocDeliverables: {
    fieldKey: 'postPocDeliverables',
    label: 'Post-POC Deliverables',
    description: 'What PlainID will hand over at the end of the POC.',
    format:
      'A list of 4–6 deliverables, one per line, no bullets. Includes architecture summary, TCO estimate, gap analysis, implementation plan, etc.',
    maxTokens: 500,
  },
  architectureConstraints: {
    fieldKey: 'architectureConstraints',
    label: 'Architecture Constraints',
    description: 'Customer-specific constraints that shape the integration design.',
    format:
      'A list of 4–6 constraints, one per line, no bullets. Examples: data residency, regulatory zone, network egress restrictions, identity store boundaries.',
    maxTokens: 500,
  },
};

export function buildFieldSuggestPrompt(
  fieldKey: string,
  poc: PocDocument,
  currentValue: string,
): { system: string; prompt: string; maxTokens: number; modelId?: string } | null {
  const p = FIELD_PROMPTS[fieldKey];
  if (!p) return null;
  const ctx = gatherFieldContext(poc);
  const isReplace = currentValue.trim().length > 0;

  const prompt = `${contextBlock(ctx)}Field to draft: ${p.label}
Description: ${p.description}
Format: ${p.format}

${
  isReplace
    ? `The SE has a current draft they want REPLACED with a stronger version. Their current draft:\n"""\n${currentValue.slice(0, 1500)}\n"""\n\nWrite a stronger replacement.`
    : `Write the initial draft.`
}

Return ONLY the field text — no preamble, no "Here is...", no Markdown. The output will be pasted directly into a form field.`;

  return { system: SE_SYSTEM, prompt, maxTokens: p.maxTokens };
}

// ---------------------------------------------------------------------
// Generate use cases
// ---------------------------------------------------------------------

export function buildGenerateUseCasesPrompt(
  poc: PocDocument,
  count = 3,
): { system: string; prompt: string; maxTokens: number; modelId?: string } {
  const ctx = gatherFieldContext(poc);
  const existingTitles = poc.useCases.map((u) => u.title).filter(Boolean);

  const prompt = `${contextBlock(ctx)}Generate ${count} candidate POC use cases for this customer. Each use case must have:
- title: Short, specific (e.g., "Databricks Row-Level SQL Authorization")
- category: One of [Data, API Gateway, AI Authorization, Identity, Compliance, Application]
- persona: The primary persona who experiences/validates this use case (e.g., "Data Analyst", "API Consumer", "Compliance Officer")
- objectives: 2–3 sentences explaining what the use case proves
- successCriteria: 3–5 concrete, measurable criteria, one per line, no bullets

${existingTitles.length > 0 ? `Avoid duplicating these existing use cases: ${existingTitles.join('; ')}\n\n` : ''}Return STRICT JSON in this shape, no preamble, no Markdown fences:
{
  "useCases": [
    {
      "title": "...",
      "category": "Data" | "API Gateway" | "AI Authorization" | "Identity" | "Compliance" | "Application",
      "persona": "...",
      "objectives": "...",
      "successCriteria": "..."
    }
  ]
}`;

  return { system: SE_SYSTEM, prompt, maxTokens: 2500 };
}

export interface GeneratedUseCase {
  title: string;
  category: string;
  persona: string;
  objectives: string;
  successCriteria: string;
}

export function parseGeneratedUseCases(text: string): GeneratedUseCase[] {
  // Strip any code fences the model may have added despite instructions
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const arr: any[] = parsed?.useCases ?? [];
    return arr
      .filter((u) => u && typeof u.title === 'string')
      .map((u) => ({
        title: String(u.title ?? '').trim(),
        category: String(u.category ?? 'Other').trim(),
        persona: String(u.persona ?? '').trim(),
        objectives: String(u.objectives ?? '').trim(),
        successCriteria: String(u.successCriteria ?? '').trim(),
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// Review POC
// ---------------------------------------------------------------------

function summarizeUseCase(u: UseCase): string {
  const auth = u.technicalSpec
    ? findAuthorizer(u.technicalSpec.authorizer.selectedAuthorizerId)
    : undefined;
  return `- "${u.title || '(untitled)'}" [${u.category}${
    auth ? `, authorizer: ${auth.name}` : ''
  }]
  Objectives: ${u.objectives?.slice(0, 200) ?? '(none)'}
  Success criteria: ${u.successCriteria?.slice(0, 250) ?? '(none)'}`;
}

export function buildReviewPocPrompt(poc: PocDocument): {
  system: string;
  prompt: string;
  maxTokens: number;
  modelId: string;
} {
  const useCaseSummaries = poc.useCases.map(summarizeUseCase).join('\n');
  const tf = poc.technicalFoundation;
  const tfSummary = tf
    ? `JWT samples: ${tf.jwtSampleUrls.length} url(s)
Identity attributes: ${tf.identityAttributeCatalog.unknown ? 'TBD' : tf.identityAttributeCatalog.value.slice(0, 200) || '(empty)'}
Test users: ${tf.testUserAccounts.unknown ? 'TBD' : tf.testUserAccounts.value.slice(0, 200) || '(empty)'}`
    : '(no technical foundation defined)';

  const prompt = `Review this PlainID POC document for quality. Customer: ${poc.customerName || '(unnamed)'} | Industry: ${poc.customerIndustry || '(unknown)'}.

=== Customer Overview ===
${poc.customerOverview?.slice(0, 800) || '(empty)'}

=== Compelling Event ===
${poc.compellingEvent?.slice(0, 600) || '(empty)'}

=== Authorization Context ===
${poc.authorizationContext?.slice(0, 600) || '(empty)'}

=== Objectives ===
${poc.objectives?.slice(0, 600) || '(empty)'}

=== What to Validate ===
${poc.whatToValidate?.slice(0, 500) || '(empty)'}

=== Post-POC Deliverables ===
${poc.postPocDeliverables?.slice(0, 500) || '(empty)'}

=== In-Scope Systems (${poc.inScopeSystems.length}) ===
${poc.inScopeSystems.map((s) => `- ${s.name}: ${s.focus || '(no focus)'}`).join('\n') || '(none)'}

=== Identity Sources (${poc.identitySources.length}) ===
${poc.identitySources.map((s) => `- ${s.name} (${s.type || '?'}): ${s.notes || '(no notes)'}`).join('\n') || '(none)'}

=== Use Cases (${poc.useCases.length}) ===
${useCaseSummaries || '(no use cases)'}

=== Technical Foundation (POC-level) ===
${tfSummary}

=== Customer Responsibilities ===
${poc.customerResponsibilities?.slice(0, 500) || '(empty)'}

=== PlainID Responsibilities ===
${poc.plainidResponsibilities?.slice(0, 500) || '(empty)'}

Review this POC for the issues that most often kill or stall PlainID engagements:
1. Vague success criteria ("works correctly", "improves security") that aren't measurable
2. Missing compelling event — POC will stall without one
3. Use cases without a clear persona or whose objectives don't tie to the success criteria
4. Inconsistencies between sections (e.g., use case mentions a system not in scope)
5. Missing technical foundation (no JWT samples, no test users) that will block week-2 work
6. Authorizer choices that don't match the use case category
7. Customer/PlainID responsibilities that are too generic to be actionable

Return STRICT JSON in this shape, no preamble, no Markdown fences:
{
  "summary": "1–2 sentence overall assessment",
  "issues": [
    {
      "severity": "critical" | "warning" | "suggestion",
      "section": "customer" | "context" | "objectives" | "discovery" | "usecases" | "technical" | "dependencies" | "framework",
      "title": "Short issue title",
      "detail": "1–3 sentence explanation of why this matters and what to do about it"
    }
  ],
  "strengths": [
    "1-sentence strength worth keeping"
  ]
}

Order issues by severity (critical first). Aim for 4–10 issues total — not a checklist, only real problems. If something is genuinely good, mention it under strengths.`;

  // Review uses Claude Opus 4.6, the most capable model for nuanced
  // strategic judgment. Runs through the async-job pattern (startAiJob)
  // rather than the synchronous aiGenerate path — so slow generation
  // doesn't matter: the SE gets a spinner icon and the work runs in the
  // background. When done, the icon flips to a green checkmark and the
  // SE can click in to see results.
  //
  // We bump maxTokens to 2500 since we're not racing the AppSync timeout
  // anymore — gives Opus room to be thorough on complex POCs.
  return {
    system: SE_SYSTEM,
    prompt,
    maxTokens: 2500,
    modelId: 'us.anthropic.claude-opus-4-6-v1',
  };
}

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'suggestion';
  section: string;
  title: string;
  detail: string;
}

export interface ReviewResult {
  summary: string;
  issues: ReviewIssue[];
  strengths: string[];
}

export function parseReview(text: string): ReviewResult | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed?.summary || !Array.isArray(parsed.issues)) return null;
    return {
      summary: String(parsed.summary),
      issues: parsed.issues
        .filter((i: any) => i && i.title)
        .map((i: any) => ({
          severity: ['critical', 'warning', 'suggestion'].includes(i.severity)
            ? i.severity
            : 'suggestion',
          section: String(i.section ?? ''),
          title: String(i.title),
          detail: String(i.detail ?? ''),
        })),
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.map(String).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
}
