import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

/**
 * Multi-purpose AI Lambda.
 *
 * Three event shapes this handler accepts:
 *
 * 1. AppSync — `aiGenerate` mutation (synchronous).
 *    Caller awaits the Bedrock result. Used for short calls (Field Suggest,
 *    Generate Use Cases) that comfortably fit under AppSync's 30s timeout.
 *
 * 2. AppSync — `startAiJob` mutation (job kickoff).
 *    Writes a `pending` AiJob row, returns the job id immediately, then
 *    self-invokes asynchronously to do the actual Bedrock work in the
 *    background. Used for long-running calls like Review POC that exceed
 *    the AppSync timeout.
 *
 * 3. Direct Lambda invocation — `{ mode: 'async-work', jobId }`.
 *    The self-invocation path. Reads the AiJob row, runs Bedrock, writes
 *    the result back. No caller is waiting; this can run for the full
 *    Lambda timeout (35-60s).
 */

const REGION = process.env.BEDROCK_REGION ?? 'us-east-1';
const DEFAULT_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';

// Allowed inference-profile IDs the client can request. Anything outside
// this allowlist falls back to DEFAULT_MODEL_ID. Keeping an allowlist makes
// the per-call model parameter safe (clients can't sneak in arbitrary
// model IDs to inflate cost or hit unauthorized inference profiles).
//
// Opus 4.6 added for Review POC (Haiku 4.5 currently blocked by the
// Bedrock-Marketplace gating in our account — Opus + Sonnet are not).
const ALLOWED_MODEL_IDS = new Set<string>([
  'us.anthropic.claude-sonnet-4-6',
  'us.anthropic.claude-opus-4-6',
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
]);

const HARD_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOKENS = 1500;

// AiJob table name — discovered at runtime by listing DynamoDB tables
// and finding the one prefixed `AiJob-`. We can't inject the table name
// via env var here because that would create a CloudFormation circular
// dependency (the Lambda's config would depend on the AiJob table being
// created, but the AiJob table's AppSync resolvers depend on the Lambda
// being available). Resolved once and cached for subsequent invocations.
let cachedAiJobTableName: string | null = null;

// Self-Lambda function name — set by AWS automatically.
const SELF_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME ?? '';

const bedrock = new BedrockRuntimeClient({ region: REGION });
const lambda = new LambdaClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const ddbRaw = new DynamoDBClient({ region: REGION });

async function resolveAiJobTable(): Promise<string> {
  if (cachedAiJobTableName) return cachedAiJobTableName;
  // Paginate through ListTables until we find the AiJob-* table.
  // In our account there's exactly one per env, so this is fast.
  let exclusiveStartTableName: string | undefined = undefined;
  for (let i = 0; i < 10; i += 1) {
    // Safety cap on pagination — 10 pages * 100 tables = 1000 tables max
    const resp = await ddbRaw.send(
      new ListTablesCommand({
        ExclusiveStartTableName: exclusiveStartTableName,
        Limit: 100,
      }),
    );
    const names = resp.TableNames ?? [];
    const match = names.find((n) => n.startsWith('AiJob-'));
    if (match) {
      cachedAiJobTableName = match;
      return match;
    }
    if (!resp.LastEvaluatedTableName) break;
    exclusiveStartTableName = resp.LastEvaluatedTableName;
  }
  throw new Error('Could not find AiJob-* DynamoDB table in this account');
}

// ============================================================
// Bedrock invocation
// ============================================================

interface BedrockResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

async function invokeBedrock(
  prompt: string,
  system: string,
  maxTokens: number,
  modelId: string,
): Promise<BedrockResult> {
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
    console.error('Bedrock invoke failed', { error: err?.message });
    throw new Error(
      err?.name === 'AccessDeniedException'
        ? 'AI feature is not yet authorized in this AWS account. Contact your admin.'
        : err?.name === 'ThrottlingException'
        ? 'AI service is busy. Please try again in a moment.'
        : 'AI generation failed. Please try again.',
    );
  }

  const decoded = new TextDecoder().decode(response.body);
  let parsed: any;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('AI service returned an unexpected response format.');
  }

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
}

function resolveModelId(requested: string | null | undefined): string {
  const trimmed = (requested ?? '').toString().trim();
  return trimmed && ALLOWED_MODEL_IDS.has(trimmed) ? trimmed : DEFAULT_MODEL_ID;
}

function resolveMaxTokens(requested: number | null | undefined): number {
  const n = Number(requested ?? DEFAULT_MAX_TOKENS);
  return Math.min(
    Math.max(Number.isFinite(n) ? n : DEFAULT_MAX_TOKENS, 64),
    HARD_MAX_TOKENS,
  );
}

// ============================================================
// Event routing
// ============================================================

export const handler = async (event: any): Promise<any> => {
  // Direct invocation path — the async-work mode is for self-invocations
  // dispatched from the startAiJob flow. No AppSync envelope present.
  if (event?.mode === 'async-work' && event?.jobId) {
    await runAsyncWork(event.jobId);
    return { ok: true };
  }

  // AppSync custom-mutation envelope — dispatch by field name.
  const fieldName = event?.info?.fieldName ?? '';
  const args = event?.arguments ?? {};
  const identity = event?.identity ?? {};
  const ownerEmail =
    (identity?.claims?.email as string) ||
    (identity?.username as string) ||
    'unknown';

  if (fieldName === 'aiGenerate') {
    return handleSyncGenerate(args);
  }

  if (fieldName === 'startAiJob') {
    return handleStartAiJob(args, ownerEmail);
  }

  throw new Error(`Unrecognized invocation: fieldName=${fieldName}`);
};

// ============================================================
// Sync aiGenerate (Field Suggest, Generate Use Cases)
// ============================================================

async function handleSyncGenerate(args: any): Promise<BedrockResult> {
  const prompt = (args.prompt ?? '').toString();
  const system = (args.system ?? '').toString();
  const maxTokens = resolveMaxTokens(args.maxTokens);
  const modelId = resolveModelId(args.modelId);
  return invokeBedrock(prompt, system, maxTokens, modelId);
}

// ============================================================
// Async startAiJob (Review POC and any future long-running feature)
// ============================================================

async function handleStartAiJob(args: any, ownerEmail: string): Promise<string> {
  if (!SELF_FUNCTION_NAME) {
    throw new Error('AWS_LAMBDA_FUNCTION_NAME not available');
  }
  const tableName = await resolveAiJobTable();

  const feature = (args.feature ?? '').toString();
  const pocId = (args.pocId ?? '').toString();
  const prompt = (args.prompt ?? '').toString();
  const system = (args.system ?? '').toString();
  const maxTokens = resolveMaxTokens(args.maxTokens);
  const modelId = resolveModelId(args.modelId);

  if (!feature || !pocId || !prompt.trim()) {
    throw new Error('feature, pocId, and prompt are required');
  }

  const jobId = randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  // 30-day TTL in unix seconds
  const ttl = Math.floor(now.getTime() / 1000) + 30 * 24 * 60 * 60;

  // The promptJson stores the inputs the async worker will need to run
  // Bedrock — keeps the worker stateless and lets us debug what was sent.
  const promptJson = JSON.stringify({ prompt, system, maxTokens, modelId });

  // Amplify-managed models use a few standard fields and a couple of
  // bookkeeping fields (id, createdAt, updatedAt, owner). We write through
  // the DynamoDB API directly because the Lambda can't easily call its
  // own AppSync.
  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        id: jobId,
        ownerEmail,
        feature,
        pocId,
        status: 'pending',
        promptJson,
        createdAt: nowIso,
        updatedAt: nowIso,
        ttl,
        __typename: 'AiJob',
      },
    }),
  );

  // Kick off the worker — asynchronous invocation. The InvokeCommand with
  // InvocationType 'Event' returns immediately; the worker runs separately.
  try {
    await lambda.send(
      new InvokeCommand({
        FunctionName: SELF_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ mode: 'async-work', jobId })),
      }),
    );
  } catch (err: any) {
    // If we can't start the worker, mark the row failed so the client
    // doesn't poll forever.
    console.error('Failed to launch async worker', err);
    await markJobError(jobId, `Failed to start AI job: ${err?.message ?? err}`);
    throw new Error('Failed to start AI job. Please try again.');
  }

  return jobId;
}

// ============================================================
// Async worker — runs Bedrock, writes result back to the AiJob row.
// ============================================================

async function runAsyncWork(jobId: string): Promise<void> {
  let tableName: string;
  try {
    tableName = await resolveAiJobTable();
  } catch (err: any) {
    console.error('Could not resolve AiJob table', err);
    return;
  }

  // Pull the job row to recover the inputs the original caller sent.
  let job: any;
  try {
    const got = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: jobId },
      }),
    );
    job = got.Item;
  } catch (err: any) {
    console.error('Could not load AiJob row', { jobId, error: err?.message });
    return;
  }
  if (!job) {
    console.error('AiJob row not found', { jobId });
    return;
  }
  if (job.status !== 'pending') {
    console.log('AiJob already settled, skipping', { jobId, status: job.status });
    return;
  }

  let inputs: { prompt: string; system: string; maxTokens: number; modelId: string };
  try {
    inputs = JSON.parse(job.promptJson);
  } catch {
    await markJobError(jobId, 'Saved job inputs were corrupt');
    return;
  }

  try {
    const result = await invokeBedrock(
      inputs.prompt,
      inputs.system,
      inputs.maxTokens,
      inputs.modelId,
    );
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: jobId },
        UpdateExpression:
          'SET #s = :s, #r = :r, #i = :i, #o = :o, #c = :c, #u = :u',
        ExpressionAttributeNames: {
          '#s': 'status',
          '#r': 'result',
          '#i': 'inputTokens',
          '#o': 'outputTokens',
          '#c': 'completedAt',
          '#u': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':s': 'complete',
          ':r': result.text,
          ':i': result.inputTokens,
          ':o': result.outputTokens,
          ':c': new Date().toISOString(),
          ':u': new Date().toISOString(),
        },
      }),
    );
  } catch (err: any) {
    console.error('AsyncWork Bedrock failed', { jobId, error: err?.message });
    await markJobError(jobId, err?.message ?? 'AI generation failed');
  }
}

async function markJobError(jobId: string, message: string): Promise<void> {
  let tableName: string;
  try {
    tableName = await resolveAiJobTable();
  } catch {
    return;
  }
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: jobId },
        UpdateExpression: 'SET #s = :s, #e = :e, #c = :c, #u = :u',
        ExpressionAttributeNames: {
          '#s': 'status',
          '#e': 'errorMessage',
          '#c': 'completedAt',
          '#u': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':s': 'error',
          ':e': message,
          ':c': new Date().toISOString(),
          ':u': new Date().toISOString(),
        },
      }),
    );
  } catch (err: any) {
    console.error('Could not write error to AiJob row', { jobId, error: err?.message });
  }
}
