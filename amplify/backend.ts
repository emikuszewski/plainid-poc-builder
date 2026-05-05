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
 * Claude Sonnet 4.5 inference profile.
 *
 * The `us.anthropic...` ID is a cross-region inference profile that may
 * route to any "us." region with capacity. The IAM grant must cover:
 *   1. The inference profile ARN itself
 *   2. Every foundation-model ARN the profile may route to
 *
 * NOTE: This grants permission. You ALSO need to enable model access for
 * Claude Sonnet 4.5 in the AWS Bedrock console (Model access page), which
 * is a separate one-time per-region opt-in.
 */
backend.aiGenerate.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      // Inference profile in every region it may exist in
      'arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-east-2:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-west-2:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      // Foundation model in every region the profile may route to
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
    ],
  }),
);
