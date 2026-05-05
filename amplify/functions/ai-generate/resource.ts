import { defineFunction } from '@aws-amplify/backend';

/**
 * AI Bedrock proxy.
 *
 * Browser → AppSync mutation `aiGenerate(prompt, system, maxTokens)` → this
 * Lambda → Bedrock (Claude Sonnet 4.5 in us-east-1) → response back through
 * AppSync to browser.
 *
 * Why Lambda: keeps Bedrock IAM credentials server-side, lets us scope IAM
 * narrowly, gives us one place to add logging/rate limits/budget guards.
 *
 * Why us-east-1: Sonnet 4.5 is broadly available there.
 */
export const aiGenerate = defineFunction({
  name: 'ai-generate',
  entry: './handler.ts',
  timeoutSeconds: 60, // Sonnet calls can take 10-30s for long generations
  memoryMB: 512,
  environment: {
    BEDROCK_REGION: 'us-east-1',
    BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  },
});
