import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { Schema } from '../../data/resource';

/**
 * AppSync custom-mutation handler. Receives { prompt, system, maxTokens }
 * from the authenticated user, invokes Bedrock with the configured model,
 * returns the generated text.
 *
 * Errors are surfaced as thrown exceptions; AppSync turns these into
 * GraphQL errors the browser can render.
 */

const REGION = process.env.BEDROCK_REGION ?? 'us-east-1';
const DEFAULT_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';

// Allowed inference-profile IDs the client can request. Anything outside
// this allowlist falls back to DEFAULT_MODEL_ID. Keeping an allowlist makes
// the per-call model parameter safe (clients can't sneak in arbitrary
// model IDs to inflate cost or hit unauthorized inference profiles).
const ALLOWED_MODEL_IDS = new Set<string>([
  'us.anthropic.claude-sonnet-4-6',
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
]);

// Cap output size as a safety belt — caller can request less but never more.
const HARD_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOKENS = 1500;

const bedrock = new BedrockRuntimeClient({ region: REGION });

export const handler: Schema['aiGenerate']['functionHandler'] = async (event) => {
  const args = event.arguments ?? {};
  const prompt = (args.prompt ?? '').toString();
  const system = (args.system ?? '').toString();
  const requestedMax = Number(args.maxTokens ?? DEFAULT_MAX_TOKENS);
  const maxTokens = Math.min(
    Math.max(Number.isFinite(requestedMax) ? requestedMax : DEFAULT_MAX_TOKENS, 64),
    HARD_MAX_TOKENS,
  );

  // Pick the model — caller can request a specific allowed inference
  // profile (e.g. Haiku for Review). Anything not on the allowlist falls
  // back to the configured default.
  const requestedModel = (args.modelId ?? '').toString().trim();
  const modelId =
    requestedModel && ALLOWED_MODEL_IDS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL_ID;

  if (!prompt.trim()) {
    throw new Error('prompt is required');
  }

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    system: system || undefined,
    messages: [{ role: 'user', content: prompt }],
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  let response;
  try {
    response = await bedrock.send(command);
  } catch (err: any) {
    // Surface a clean error to the client without leaking infra details.
    console.error('Bedrock invoke failed', { error: err?.message });
    throw new Error(
      err?.name === 'AccessDeniedException'
        ? 'AI feature is not yet authorized in this AWS account. Contact your admin.'
        : err?.name === 'ThrottlingException'
        ? 'AI service is busy. Please try again in a moment.'
        : 'AI generation failed. Please try again.',
    );
  }

  // Bedrock returns the body as a Uint8Array — decode and parse.
  const decoded = new TextDecoder().decode(response.body);
  let parsed: any;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('AI service returned an unexpected response format.');
  }

  // Anthropic's content array — concatenate any text blocks.
  const content: Array<{ type: string; text?: string }> = parsed?.content ?? [];
  const text = content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('AI returned an empty response. Please try again.');
  }

  return {
    text,
    inputTokens: parsed?.usage?.input_tokens ?? 0,
    outputTokens: parsed?.usage?.output_tokens ?? 0,
    stopReason: parsed?.stop_reason ?? 'end_turn',
  };
};
