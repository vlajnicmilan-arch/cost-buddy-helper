/**
 * Single mechanism for "where to send the person back after signing in".
 *
 * Public screens that require an account (invitations, paywall handoff, …)
 * store the path here before navigating to /auth. `App.tsx` consumes it when
 * an authenticated user lands on /auth again.
 *
 * Only same-origin absolute paths are accepted, so a stored value can never
 * redirect off-site. Best-effort: never throws.
 */

export const AUTH_RETURN_KEY = 'returnUrl';

/** True only for safe in-app paths ("/foo"), never protocol-relative ("//evil"). */
export const isSafeReturnPath = (value: string | null | undefined): boolean =>
  !!value && value.startsWith('/') && !value.startsWith('//');

/** Remember where to return after authentication. */
export const rememberAuthReturn = (path: string): void => {
  try {
    if (!isSafeReturnPath(path)) return;
    sessionStorage.setItem(AUTH_RETURN_KEY, path.slice(0, 500));
  } catch {
    /* noop */
  }
};

/** Read the stored return path without clearing it. */
export const readAuthReturn = (): string | null => {
  try {
    const raw = sessionStorage.getItem(AUTH_RETURN_KEY);
    return isSafeReturnPath(raw) ? raw : null;
  } catch {
    return null;
  }
};

/** Read and clear the stored return path. */
export const consumeAuthReturn = (): string | null => {
  const value = readAuthReturn();
  try {
    sessionStorage.removeItem(AUTH_RETURN_KEY);
  } catch {
    /* noop */
  }
  return value;
};

/**
 * Resolve the post-auth destination from all supported sources, in priority
 * order: `?next=` query → router state → stored return path.
 * Pure — unit tested.
 */
export const resolveAuthReturnPath = (
  search: string,
  stateFrom?: string | null,
  storedPath?: string | null,
): string | null => {
  try {
    const next = new URLSearchParams(search || '').get('next');
    if (isSafeReturnPath(next)) return next;
  } catch {
    /* noop */
  }
  if (isSafeReturnPath(stateFrom)) return stateFrom as string;
  if (isSafeReturnPath(storedPath)) return storedPath as string;
  return null;
};
