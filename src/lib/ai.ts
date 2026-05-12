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
  /**
   * Optional Bedrock inference profile to invoke for this call. Leave
   * undefined to use the Lambda's configured default (Sonnet 4.6).
   * Must be on the Lambda's allowlist or it falls back to default.
   */
  modelId?: string;
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
      modelId: opts.modelId,
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
// Privacy notice acknowledgment (localStorage-backed)
//
// Stored client-side because:
//   1. The notice is informational — it doesn't gate access to anything,
//      it's just shown once.
//   2. Server-side persistence via UserPreferences had reliability issues
//      with owner-scoped reads returning empty after writes.
//   3. Browser-local persistence is fine for "have I read this notice" —
//      if the user signs in on a new browser, they re-read the notice once.
//      That's arguably correct behavior.
//
// We dispatch a custom event on accept so multiple AiButton instances on
// the same page update synchronously without each having to re-query.
// ---------------------------------------------------------------------

const NOTICE_KEY = 'pocket:ai-notice-accepted';
const NOTICE_EVENT = 'pocket:ai-notice-changed';

export function getAiNoticeAcceptedSync(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) !== null;
  } catch {
    // localStorage unavailable (private mode, SSR) — treat as not accepted;
    // user will see the notice every time but functionality still works
    return false;
  }
}

export async function getAiNoticeAccepted(): Promise<boolean> {
  return getAiNoticeAcceptedSync();
}

export async function setAiNoticeAccepted(): Promise<void> {
  try {
    localStorage.setItem(NOTICE_KEY, new Date().toISOString());
    // Notify other AiButton instances on the page
    window.dispatchEvent(new CustomEvent(NOTICE_EVENT));
  } catch (e) {
    console.warn('Could not persist AI notice acknowledgment', e);
  }
}

export function onAiNoticeChanged(handler: () => void): () => void {
  window.addEventListener(NOTICE_EVENT, handler);
  // Also listen for cross-tab storage events
  const storageHandler = (e: StorageEvent) => {
    if (e.key === NOTICE_KEY) handler();
  };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(NOTICE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
