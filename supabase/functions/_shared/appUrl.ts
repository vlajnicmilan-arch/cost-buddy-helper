/**
 * Single source of truth for the PUBLIC APP origin used in outgoing links
 * (invitations, e-mail buttons, admin deep links).
 *
 * Today `PUBLIC_APP_URL` is NOT set, so every caller resolves to
 * DEFAULT_APP_URL — behaviour is byte-identical to the previously
 * hardcoded literals. Changing the app domain later = set the secret.
 *
 * NOTE: this is the APP origin only. Mail sender domains
 * (notify.vmbalance.com) and the mail-ingest alias (centar.vmbalance.com)
 * are unrelated and must NOT be derived from here.
 */

export const DEFAULT_APP_URL = 'https://vmbalance.com'

/** Strip whitespace and any trailing slashes. */
export function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/+$/, '')
}

/** Configured app origin (no trailing slash), falling back to DEFAULT_APP_URL. */
export function getAppUrl(): string {
  let fromEnv = ''
  try {
    fromEnv = normalizeBaseUrl(Deno.env.get('PUBLIC_APP_URL'))
  } catch {
    fromEnv = ''
  }
  return fromEnv || DEFAULT_APP_URL
}

/**
 * Build an absolute app URL from a base and a path.
 * Pure — safe for e-mail templates, which never read the environment.
 */
export function joinAppUrl(base: string | undefined | null, path = ''): string {
  const origin = normalizeBaseUrl(base) || DEFAULT_APP_URL
  if (!path) return origin
  return path.startsWith('/') ? `${origin}${path}` : `${origin}/${path}`
}

/** Absolute app URL from the configured origin. */
export function appUrl(path = ''): string {
  return joinAppUrl(getAppUrl(), path)
}
