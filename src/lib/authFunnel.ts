/**
 * Acquisition funnel helpers for the landing → registration path.
 *
 * Carries the clicked CTA from the public landing page into the auth screen
 * (same tab, full page navigation → sessionStorage), and turns auth errors
 * into metadata that can never contain personal data.
 *
 * Everything here is best-effort: it must never throw and never block auth.
 */

const ENTRY_KEY = 'auth_entry_attr_v1';
const ENTRY_TTL_MS = 60 * 60 * 1000; // 1 h

export interface AuthEntryAttribution {
  [key: string]: unknown;
  entry_cta?: string;
  entry_path?: string;
  entry_at?: number;
}

/** Remember which landing CTA sent the visitor to /auth. */
export const rememberAuthEntry = (cta: string, path: string): void => {
  try {
    const payload: AuthEntryAttribution = {
      entry_cta: (cta || '').slice(0, 60),
      entry_path: (path || '').slice(0, 200),
      entry_at: Date.now(),
    };
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
};

/** Read the stored CTA attribution (empty object when absent or stale). */
export const readAuthEntry = (): AuthEntryAttribution => {
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AuthEntryAttribution;
    if (parsed.entry_at && Date.now() - parsed.entry_at > ENTRY_TTL_MS) {
      sessionStorage.removeItem(ENTRY_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
};

const VALID_AUTH_SOURCES = new Set(['home', 'projekti']);

/**
 * Record the landing source from the `?src=` query parameter when arriving at
 * `/auth`. This survives the upcoming landing/app domain split because the
 * value is written into sessionStorage from the app host itself, not carried
 * across domains. Unknown values are ignored; missing value is a no-op.
 * Pure side-effect — unit tested via sessionStorage mock.
 */
export const recordLandingAuthSource = (search: string): void => {
  try {
    const src = new URLSearchParams(search || '').get('src');
    if (!src || !VALID_AUTH_SOURCES.has(src)) return;
    const path = src === 'projekti' ? '/projekti' : '/';
    rememberAuthEntry(`landing_${src}`, path);
  } catch {
    /* noop — must never block auth */
  }
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Reduce an auth error to safe telemetry metadata.
 * Strips e-mail addresses, truncates, never carries passwords or names.
 * Pure — unit tested.
 */
export const sanitizeAuthError = (
  error: { code?: string | null; status?: number | null; message?: string | null } | null | undefined,
): { error_code: string; error_status: number | null; error_message: string } => {
  const message = (error?.message || '')
    .replace(EMAIL_RE, '[email]')
    .slice(0, 200);
  return {
    error_code: (error?.code || 'unknown').slice(0, 60),
    error_status: typeof error?.status === 'number' ? error.status : null,
    error_message: message,
  };
};

/**
 * Which tab the auth screen should open on.
 * `?mode=signup` (landing CTAs) and router state both select registration.
 * Pure — unit tested.
 */
export const resolveInitialAuthTab = (
  search: string,
  stateMode?: string | null,
): 'login' | 'register' => {
  try {
    if (stateMode === 'signup') return 'register';
    const mode = new URLSearchParams(search || '').get('mode');
    return mode === 'signup' ? 'register' : 'login';
  } catch {
    return 'login';
  }
};
