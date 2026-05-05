import { client } from './client';
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

/**
 * AI client — wraps the aiGenerate mutation, handles privacy-notice gating,
 * and writes minimal usage logs to AiUsageLog.
 *
 * Privacy notice: shown on first use per user. Stored as
 * UserPreferences.aiNoticeAcceptedAt (ISO timestamp). Once set, never asked
 * again unless the user clicks the (i) icon next to an AI button to re-read.
 *
 * Logging: every call writes one AiUsageLog row with feature name, token
 * counts, success/error, and timestamp. Prompt/response text are NOT logged.
 */

export type AiFeature = 'field-suggest' | 'generate-use-cases' | 'review-poc';

export interface AiGenerateOptions {
  prompt: string;
  system?: string;
  maxTokens?: number;
  feature: AiFeature;
  pocId?: string; // for log linkage
}

export interface AiGenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function getCurrentEmail(): Promise<string> {
  try {
    const session = await fetchAuthSession();
    const email = session.tokens?.idToken?.payload?.email as string | undefined;
    if (email) return email;
  } catch {
    /* fall through */
  }
  try {
    const user = await getCurrentUser();
    return user.signInDetails?.loginId ?? user.username;
  } catch {
    return '';
  }
}

export async function generate(opts: AiGenerateOptions): Promise<AiGenerateResult> {
  const userEmail = await getCurrentEmail();
  const startedAt = new Date().toISOString();

  let result: AiGenerateResult | undefined;
  let errorMessage: string | undefined;

  try {
    const response = await client.mutations.aiGenerate({
      prompt: opts.prompt,
      system: opts.system,
      maxTokens: opts.maxTokens ?? 1500,
    });

    if (response.errors?.length) {
      throw new Error(response.errors[0]?.message ?? 'AI request failed');
    }
    const data = response.data as
      | { text: string; inputTokens?: number; outputTokens?: number }
      | null;
    if (!data?.text) {
      throw new Error('Empty AI response');
    }
    result = {
      text: data.text,
      inputTokens: data.inputTokens ?? 0,
      outputTokens: data.outputTokens ?? 0,
    };
  } catch (err: any) {
    errorMessage = err?.message ?? 'AI request failed';
  }

  // Fire-and-forget log write — don't block the caller on log success/failure.
  // Errors here are swallowed; failing to log shouldn't fail the user's flow.
  void writeUsageLog({
    userEmail,
    feature: opts.feature,
    pocId: opts.pocId,
    inputTokens: result?.inputTokens ?? 0,
    outputTokens: result?.outputTokens ?? 0,
    success: !!result,
    errorMessage,
    timestamp: startedAt,
  });

  if (!result) {
    throw new Error(errorMessage ?? 'AI generation failed');
  }
  return result;
}

interface UsageLogInput {
  userEmail: string;
  feature: AiFeature;
  pocId?: string;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  errorMessage?: string;
  timestamp: string;
}

async function writeUsageLog(input: UsageLogInput): Promise<void> {
  try {
    await client.models.AiUsageLog.create({
      userEmail: input.userEmail,
      feature: input.feature,
      pocId: input.pocId ?? null,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      success: input.success,
      errorMessage: input.errorMessage ?? null,
      timestamp: input.timestamp,
    });
  } catch {
    /* swallow — logging failure shouldn't surface to the user */
  }
}

// ---------------------------------------------------------------------
// Privacy notice acknowledgment
// ---------------------------------------------------------------------

export async function getAiNoticeAccepted(): Promise<boolean> {
  try {
    const result = await client.models.UserPreferences.list();
    const prefs = (result.data ?? [])[0];
    return !!prefs?.aiNoticeAcceptedAt;
  } catch {
    return false;
  }
}

export async function setAiNoticeAccepted(): Promise<void> {
  const userEmail = await getCurrentEmail();
  const acceptedAt = new Date().toISOString();
  try {
    const existing = await client.models.UserPreferences.list();
    const row = (existing.data ?? [])[0];
    if (row) {
      await client.models.UserPreferences.update({
        id: row.id,
        aiNoticeAcceptedAt: acceptedAt,
      });
    } else {
      await client.models.UserPreferences.create({
        userEmail,
        aiNoticeAcceptedAt: acceptedAt,
      });
    }
  } catch (e) {
    console.warn('Could not persist AI notice acknowledgment', e);
  }
}
