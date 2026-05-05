import { defineBackend } from '@aws-amplify/backend';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { aiGenerate } from './functions/ai-generate/resource';

const backend = defineBackend({
  auth,
  data,
  aiGenerate,
});

/**
 * Grant the ai-generate Lambda permission to invoke Bedrock for the
 * Claude Sonnet 4.6 inference profile (with 4.5 fallback).
 *
 * Sonnet 4.6's naming convention changed — date and version suffix dropped
 * (`anthropic.claude-sonnet-4-6` instead of `...4-5-20250929-v1:0`).
 *
 * The `us.` prefix is a cross-region inference profile that may route to
 * any "us." region with capacity. The IAM grant covers:
 *   1. The inference profile ARN itself (in every source region)
 *   2. Every foundation-model ARN the profile may route to
 */
backend.aiGenerate.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      // Sonnet 4.6 — inference profile in every source region
      'arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-sonnet-4-6',
      'arn:aws:bedrock:us-east-2:*:inference-profile/us.anthropic.claude-sonnet-4-6',
      'arn:aws:bedrock:us-west-2:*:inference-profile/us.anthropic.claude-sonnet-4-6',
      // Sonnet 4.6 — foundation model in every routable region
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6',
      'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-sonnet-4-6',
      'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-sonnet-4-6',
      // Sonnet 4.5 — kept as fallback during transition
      'arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-east-2:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-west-2:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
    ],
  }),
);
