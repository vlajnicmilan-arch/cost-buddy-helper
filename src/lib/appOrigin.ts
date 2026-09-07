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
 * Deliberately does NOT include `app.vmbalance.com` yet — that lands together
 * with the new Android shell.
 */
export const PROD_APP_HOSTS: readonly string[] = (() => {
  const hosts = new Set<string>();
  try {
    const host = new URL(APP_ORIGIN).hostname;
    hosts.add(host);
    hosts.add(host.startsWith('www.') ? host.slice(4) : `www.${host}`);
  } catch {
    hosts.add('vmbalance.com');
    hosts.add('www.vmbalance.com');
  }
  return Array.from(hosts);
})();

export const isProdAppHost = (hostname: string): boolean =>
  PROD_APP_HOSTS.includes(hostname);
