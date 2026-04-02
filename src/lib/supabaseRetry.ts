import { supabase } from '@/integrations/supabase/client';

/**
 * Check if an error is related to JWT/auth expiry
 */
function isAuthError(error: unknown): boolean {
  if (!error) return false;
  const msg = typeof error === 'object' && error !== null
    ? (error as any).message || (error as any).msg || String(error)
    : String(error);
  const status = typeof error === 'object' && error !== null ? (error as any).status || (error as any).code : undefined;
  
  return (
    status === 401 ||
    status === 403 ||
    /jwt|token.*expir|unauthorized|invalid.*token/i.test(msg)
  );
}

/**
 * Wraps a Supabase operation with automatic session refresh and retry on auth errors.
 * If the first attempt fails with an auth-related error, refreshes the session and retries once.
 */
export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isAuthError(error)) {
      console.log('[withAuthRetry] Auth error detected, refreshing session and retrying...');
      try {
        await supabase.auth.refreshSession();
      } catch (refreshErr) {
        console.warn('[withAuthRetry] Session refresh failed:', refreshErr);
        throw error; // throw original error
      }
      return await fn(); // retry once
    }
    throw error;
  }
}

/**
 * Gets a fresh access token by calling getSession() right before use.
 * Avoids stale tokens from cached session objects.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
