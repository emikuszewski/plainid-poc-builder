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
      'arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-opus-4-6',
      'arn:aws:bedrock:us-east-2:*:inference-profile/us.anthropic.claude-opus-4-6',
      'arn:aws:bedrock:us-west-2:*:inference-profile/us.anthropic.claude-opus-4-6',
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-opus-4-6',
      'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-opus-4-6',
      'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-opus-4-6',
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
 *      the job id immediately.
 *
 *   2. The Lambda needs DynamoDB Get/Put/Update on the AiJob table.
 *      We grant against a WILDCARD ARN pattern (`table/AiJob-*`) rather
 *      than the specific table ARN so the Lambda's IAM role doesn't
 *      depend on the AiJob CDK construct. Hard-referencing the AiJob
 *      table ARN creates a circular dependency inside the data stack:
 *      Lambda → role policy → table → AppSync function-directive →
 *      Lambda. The wildcard breaks the cycle. Only one AiJob-* table
 *      exists per environment, so the wildcard isn't a meaningful
 *      security loosening.
 *
 *   3. We deliberately do NOT inject `AI_JOB_TABLE_NAME` as a Lambda
 *      env var here — that would create the same kind of cycle. Instead
 *      the Lambda discovers the table name at runtime by listing tables
 *      and finding the one prefixed `AiJob-` (cached after first call).
 *
 * The AiJob table itself is referenced only via `backend.data.resources.tables`
 * for the TTL override below; that doesn't create a Lambda dependency.
 */
const aiJobTable = backend.data.resources.tables['AiJob'];

backend.aiGenerate.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['lambda:InvokeFunction'],
    resources: [backend.aiGenerate.resources.lambda.functionArn],
  }),
);

backend.aiGenerate.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:ListTables',
    ],
    resources: [
      'arn:aws:dynamodb:*:*:table/AiJob-*',
      // ListTables operates on the service, not a resource
      '*',
    ],
  }),
);

/**
 * Enable DynamoDB TTL on the AiJob table — old job rows auto-delete
 * after 30 days. The Lambda sets the `ttl` attribute to (now + 30d) at
 * row creation time; DynamoDB sweeps it.
 */
const cfnAiJobTable = aiJobTable.node.defaultChild as any;
if (cfnAiJobTable) {
  cfnAiJobTable.addPropertyOverride('TimeToLiveSpecification', {
    AttributeName: 'ttl',
    Enabled: true,
  });
}
