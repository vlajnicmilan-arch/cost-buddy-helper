/**
 * Maps raw backend / network errors to friendly, localized user messages.
 *
 * Use whenever a caught error would otherwise be shown directly to the user
 * (e.g. `showError(error.message)`). Falls back to a generic localized
 * message and logs the original error to the console for diagnostics.
 *
 * Two usage modes:
 *   1) In React components / hooks with i18n already wired:
 *        const { t } = useTranslation();
 *        showError(formatErrorForUser(e, t));
 *   2) In hooks/utilities without useTranslation, use the standalone
 *      `tr(key, fallback)` and `friendlyError(e, fallbackKey?)` helpers.
 */
import i18nInstance from '@/i18n';

export type TFunc = (key: string, defaultOrOpts?: any, opts?: any) => string;

/** Standalone translator using the global i18n instance — safe outside React. */
export const tr = (key: string, fallback?: string, opts?: Record<string, unknown>): string => {
  const value = i18nInstance.t(key, { defaultValue: fallback ?? key, ...(opts || {}) });
  return typeof value === 'string' ? value : (fallback ?? key);
};

interface FormatOptions {
  /** i18n fallback key, e.g. 'errors.save.expense'. Used if no specific match. */
  fallbackKey?: string;
  /** Verbatim fallback string used if neither match nor fallbackKey produces text. */
  fallbackText?: string;
}

interface NormalizedError {
  message: string;
  code?: string;
  status?: number;
  name?: string;
}

const normalize = (err: unknown): NormalizedError => {
  if (!err) return { message: '' };
  if (typeof err === 'string') return { message: err };
  const e = err as any;
  return {
    message: String(e?.message ?? e?.error_description ?? e?.error ?? ''),
    code: e?.code ? String(e.code) : undefined,
    status: typeof e?.status === 'number' ? e.status : undefined,
    name: e?.name ? String(e.name) : undefined,
  };
};

/**
 * Returns a human-friendly, translated message for a thrown error.
 * Recognises common Supabase / Postgres / network signatures.
 */
export function formatErrorForUser(
  error: unknown,
  t: TFunc,
  options: FormatOptions = {}
): string {
  const { fallbackKey, fallbackText } = options;
  const e = normalize(error);
  const msg = e.message.toLowerCase();

  // Log raw error for diagnostics — never silently swallow.
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[formatErrorForUser]', error);
  }

  // Abort / cancellation — caller usually shouldn't show, but if they do:
  if (e.name === 'AbortError' || msg.includes('abort')) {
    return t('errors.timeout', 'The request was cancelled.');
  }

  // Network failures
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    e.name === 'TypeError' && msg.includes('fetch')
  ) {
    return t('errors.network', 'No internet connection. Check your network and try again.');
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return t('errors.timeout', 'The request timed out. Please try again.');
  }

  // Auth / session
  if (
    msg.includes('jwt expired') ||
    msg.includes('jwt is expired') ||
    msg.includes('session') && msg.includes('expired') ||
    e.code === 'PGRST301'
  ) {
    return t('errors.sessionExpired', 'Your session has expired. Please sign in again.');
  }
  if (
    msg.includes('not authenticated') ||
    msg.includes('jwt') && msg.includes('invalid') ||
    e.status === 401
  ) {
    return t('errors.unauthorized', 'You are not signed in. Please sign in and try again.');
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return t('errors.auth.wrongCredentials', 'Wrong email or password');
  }
  if (msg.includes('email not confirmed')) {
    return t('errors.auth.emailNotConfirmed', 'Email address has not been confirmed');
  }
  if (msg.includes('already registered') || msg.includes('user already')) {
    return t('errors.auth.userExists', 'A user with this email already exists');
  }

  // Permission / RLS
  if (
    e.status === 403 ||
    e.code === '42501' ||
    msg.includes('permission denied') ||
    msg.includes('not allowed') ||
    msg.includes('row-level security')
  ) {
    return t('errors.forbidden', "You don't have permission to do this.");
  }

  // Not found
  if (e.status === 404 || e.code === 'PGRST116' || msg.includes('not found')) {
    return t('errors.notFound', 'Item not found.');
  }

  // Postgres unique violation
  if (e.code === '23505' || msg.includes('duplicate key') || msg.includes('already exists')) {
    return t('errors.duplicate', 'An item with these details already exists.');
  }

  // Rate limit
  if (e.status === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
    return t('errors.receipt.rateLimit', 'Too many requests. Please try again in a minute.');
  }

  // Server errors
  if (e.status && e.status >= 500) {
    return t('errors.generic', 'Something went wrong. Please try again.');
  }

  // Try caller-provided fallback i18n key
  if (fallbackKey) {
    return t(fallbackKey, fallbackText ?? e.message ?? undefined);
  }

  // Fallback: caller text > generic localized
  if (fallbackText) return fallbackText;
  return t('errors.generic', 'Something went wrong. Please try again.');
}
