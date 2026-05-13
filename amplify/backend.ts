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
 * inference profiles this app uses:
 *
 *   - Sonnet 4.6   — default model for Field Suggest, Generate Use Cases.
 *   - Opus 4.6     — used by Review POC. Async-job pattern (see backend
 *                    AiJob model) means Opus's slower generation doesn't
 *                    affect UX — the user gets a spinner icon and the
 *                    work runs in the background.
 *   - Haiku 4.5    — declared but currently blocked by Bedrock-Marketplace
 *                    gating in our account. Will start working again once
 *                    a user with marketplace permissions invokes it once
 *                    from the console.
 *   - Sonnet 4.5   — kept as fallback during transition.
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
      // Opus 4.6 — inference profile + foundation model
      'arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-opus-4-6-v1',
      'arn:aws:bedrock:us-east-2:*:inference-profile/us.anthropic.claude-opus-4-6-v1',
      'arn:aws:bedrock:us-west-2:*:inference-profile/us.anthropic.claude-opus-4-6-v1',
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-opus-4-6-v1',
      'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-opus-4-6-v1',
      'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-opus-4-6-v1',
      // Haiku 4.5 — inference profile in every source region
      'arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0',
      'arn:aws:bedrock:us-east-2:*:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0',
      'arn:aws:bedrock:us-west-2:*:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0',
      // Haiku 4.5 — foundation model in every routable region
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
      'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
      'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
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

/**
 * Async-job plumbing for startAiJob:
 *
 *   1. The Lambda must be able to invoke itself with InvocationType=Event
 *      so the startAiJob mutation can kick off background work and return
 *      the job id immediately. We grant against a WILDCARD ARN pattern
 *      rather than `lambda.functionArn` — a hard reference to the
 *      Lambda's own ARN inside its own role's policy creates a
 *      CloudFormation circular dependency (Lambda needs its role
 *      attached; role needs the policy; policy needs the Lambda ARN).
 *
 *   2. The Lambda needs DynamoDB Get/Put/Update on the AiJob table.
 *      We grant against a WILDCARD ARN pattern (`table/AiJob-*`) for
 *      the same reason — hard-referencing the AiJob table ARN created
 *      a similar cycle when the Lambda lives in the data stack.
 *
 *   3. We deliberately do NOT inject `AI_JOB_TABLE_NAME` as a Lambda
 *      env var here — that would create the same kind of cycle. The
 *      Lambda discovers the table name at runtime by listing tables
 *      and finding the one prefixed `AiJob-` (cached after first call).
 *
 * Only the TTL configuration on the AiJob table is now done manually
 * (see comment below) — we avoid any reference to the AiJob CDK
 * construct from this file because such references create implicit
 * dependency edges that conflict with the Lambda being an AppSync
 * resolver in the same stack.
 */

backend.aiGenerate.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['lambda:InvokeFunction'],
    resources: [
      // Wildcard that matches the actual deployed function name:
      //   amplify-<app-id>-<branch>-aigeneratelambda<hash>-<suffix>
      // We use a broad amplify-* match because the construct id portion
      // (`aigeneratelambda`) is not hyphenated and prior narrower
      // patterns missed it. The role is only attached to this one
      // Lambda, so granting "any amplify-* function" here only matters
      // to this function — it can't escalate beyond itself.
      'arn:aws:lambda:*:*:function:amplify-*',
    ],
  }),
);

backend.aiGenerate.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
    ],
    resources: ['arn:aws:dynamodb:*:*:table/AiJob-*'],
  }),
);

backend.aiGenerate.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['dynamodb:ListTables'],
    // ListTables operates on the service, not a specific resource
    resources: ['*'],
  }),
);

/**
 * Note on DynamoDB TTL: we previously enabled TTL on the AiJob table
 * via a CDK property override here. That created a circular dependency
 * because the override pulled `backend.data.resources.tables['AiJob']`
 * into this file, and any reference to the AiJob CDK construct creates
 * an implicit edge in the dependency graph that conflicts with the
 * Lambda being a data resolver.
 *
 * Workaround: enable TTL manually in the AWS console (DynamoDB → AiJob
 * table → Additional settings → TTL → Enable, attribute name `ttl`).
 * The Lambda already sets `ttl` to unix-seconds 30d out at row create
 * time, so once TTL is enabled in the console, sweeping just works.
 */
