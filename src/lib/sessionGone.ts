/**
 * Sign-out mid-fetch detection.
 *
 * A fetch started while signed in can land after the session is gone
 * (sign-out, expiry). The request then runs as `anon`, RLS denies it and the
 * user sees a red "fetch failed" toast for something they never did.
 *
 * `isSessionGone` answers one question: "did the session disappear or change
 * under this fetch?". Callers use it in their catch branch to stay silent.
 */
import { supabase } from '@/integrations/supabase/client';

/** Pure comparison — live identity no longer matches the fetch's identity. */
export function isSessionMismatch(
  expectedUserId: string | null | undefined,
  liveUserId: string | null | undefined,
): boolean {
  if (!expectedUserId) return false;
  return liveUserId !== expectedUserId;
}

export interface SessionGoneOptions {
  /** Synchronously known live user id (e.g. a ref filled by auth events). */
  liveUserId?: string | null;
  /** Injectable session reader (tests). */
  getSession?: () => Promise<{ data: { session: { user?: { id?: string } } | null } }>;
}

/**
 * True when the session is gone (or belongs to another user) relative to
 * `expectedUserId`. Never throws — an unreadable session is treated as
 * "still there" so genuine errors keep surfacing.
 */
export async function isSessionGone(
  expectedUserId: string | null | undefined,
  options: SessionGoneOptions = {},
): Promise<boolean> {
  if (options.liveUserId !== undefined && isSessionMismatch(expectedUserId, options.liveUserId)) {
    return true;
  }

  const getSession = options.getSession ?? (() => supabase.auth.getSession() as any);
  try {
    const { data } = await getSession();
    const liveId = data?.session?.user?.id ?? null;
    if (!liveId) return true;
    if (expectedUserId && liveId !== expectedUserId) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Whether the "no internet — retrying" warning may be shown for this attempt.
 * Android backgrounding aborts in-flight requests while the connection is
 * fine, and those recover on the very next attempt — so the first attempt
 * stays silent unless the device itself reports being offline.
 */
export function shouldWarnOnRetry(attempt: number, online: boolean): boolean {
  return !online || attempt >= 2;
}
