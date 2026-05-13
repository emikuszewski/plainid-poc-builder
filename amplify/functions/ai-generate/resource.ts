import { defineFunction } from '@aws-amplify/backend';

/**
 * AI Bedrock proxy.
 *
 * Browser → AppSync mutations (aiGenerate, startAiJob) → this Lambda
 * → Bedrock (Claude family models in us-east-1).
 *
 * Why Lambda: keeps Bedrock IAM credentials server-side, lets us scope IAM
 * narrowly, gives us one place to add logging/rate limits/budget guards.
 *
 * resourceGroupName: 'data' — this Lambda is BOTH an AppSync handler
 * (the data stack depends on it) AND a consumer of the AiJob DynamoDB
 * table name (it depends on the data stack). Without explicit placement
 * CloudFormation builds two separate nested stacks with a circular
 * dependency. Pinning the Lambda into the data stack collapses the
 * circle: everything that needs the Lambda is in the same stack as
 * the Lambda itself.
 */
export const aiGenerate = defineFunction({
  name: 'ai-generate',
  entry: './handler.ts',
  resourceGroupName: 'data',
  timeoutSeconds: 60,
  memoryMB: 512,
  environment: {
    BEDROCK_REGION: 'us-east-1',
    BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-6',
  },
});
