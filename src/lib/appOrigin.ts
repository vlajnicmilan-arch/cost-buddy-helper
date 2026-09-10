/**
 * Single source of truth for the PUBLIC APP origin on the frontend.
 *
 * `VITE_APP_ORIGIN` is NOT set today, so everything resolves to
 * DEFAULT_APP_ORIGIN — behaviour is identical to the previously hardcoded
 * literals. Changing the app domain later = set one env var.
 *
 * NOTE: app origin only. Mail domains (notify.vmbalance.com), the mail-ingest
 * alias and the marketing/legal pages are unrelated and stay as they are.
 */

export const DEFAULT_APP_ORIGIN = 'https://vmbalance.com';

const normalize = (value?: string | null): string =>
  (value || '').trim().replace(/\/+$/, '');

/** Configured app origin, without a trailing slash. */
export const APP_ORIGIN: string =
  normalize(import.meta.env.VITE_APP_ORIGIN as string | undefined) ||
  DEFAULT_APP_ORIGIN;

/** Absolute app URL built from APP_ORIGIN. */
export const appUrl = (path = ''): string => {
  if (!path) return APP_ORIGIN;
  return path.startsWith('/') ? `${APP_ORIGIN}${path}` : `${APP_ORIGIN}/${path}`;
};

/**
 * Hostnames treated as production for the app.
 * Includes `app.vmbalance.com` — the Android shell 3.0.2+ knows it, so the
 * web code treats it as a prod app host ahead of the landing/app split.
 */
export const PROD_APP_HOSTS: readonly string[] = (() => {
  const hosts = new Set<string>();
  try {
    const host = new URL(APP_ORIGIN).hostname;
    hosts.add(host);
    hosts.add(host.startsWith('www.') ? host.slice(4) : `www.${host}`);
    hosts.add(`app.${host.startsWith('www.') ? host.slice(4) : host}`);
  } catch {
    hosts.add('vmbalance.com');
    hosts.add('www.vmbalance.com');
    hosts.add('app.vmbalance.com');
  }
  return Array.from(hosts);
})();

export const isProdAppHost = (hostname: string): boolean =>
  PROD_APP_HOSTS.includes(hostname);

/** Hostnames that serve the app itself rather than the marketing landing page.
 * Derived from PROD_APP_HOSTS so the upcoming landing/app domain split does not
 * introduce a new hardcoded literal. */
export const APP_SUBDOMAIN_HOSTS: readonly string[] = PROD_APP_HOSTS.filter((h) =>
  h.startsWith('app.'),
);

export const isAppHost = (hostname: string): boolean =>
  APP_SUBDOMAIN_HOSTS.includes(hostname);

/**
 * Whether the root `/` route should bypass the marketing landing page and go
 * straight to `/auth`. True only on production app hosts (e.g. app.vmbalance.com)
 * when no user is signed in. Installed/PWA users are handled separately.
 */
export const shouldSkipLanding = (hostname: string, user: unknown): boolean =>
  isAppHost(hostname) && !user;
