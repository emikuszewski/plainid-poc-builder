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
 * The `us.anthropic...` ID is a cross-region inference profile. Bedrock
 * requires permission on both the inference profile AND the underlying
 * foundation model in every region the profile may route to (us-east-1,
 * us-east-2, us-west-2 for the `us.` profiles).
 */
backend.aiGenerate.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      'arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
      'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
    ],
  }),
);
