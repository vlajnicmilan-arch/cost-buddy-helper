/**
 * Single source of truth for the "fast landing" condition.
 *
 * Two consumers must agree, byte for byte:
 *   1. `src/main.tsx` — decides whether to render the landing page directly
 *      instead of booting the full app.
 *   2. `scripts/bakeLandingPlugin.mjs` — inlines the region between the
 *      markers below into the baked `dist/index.html` boot script, so the
 *      prerendered markup is dropped in exactly the cases where the app would
 *      not show the landing page.
 *
 * The region between FAST_LANDING:START and FAST_LANDING:END is plain,
 * dependency-free ES5-compatible JavaScript on purpose: the build step lifts
 * it verbatim (only `export ` is stripped) into an inline <script>. Keep it
 * that way — no TypeScript syntax, no imports, no optional chaining sugar
 * beyond what a browser inline script can run.
 */

/* FAST_LANDING:START */
export function isInstalledApp() {
  if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (navigator.standalone === true) return true;
  return false;
}

export function hasAuthHashOrQuery() {
  var hash = window.location.hash || '';
  var search = window.location.search || '';
  return (
    hash.indexOf('access_token=') !== -1 ||
    hash.indexOf('refresh_token=') !== -1 ||
    hash.indexOf('error=') !== -1 ||
    hash.indexOf('error_description=') !== -1 ||
    search.indexOf('code=') !== -1 ||
    search.indexOf('error=') !== -1 ||
    search.indexOf('error_description=') !== -1
  );
}

export function hasStoredAuthSession() {
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i) || '';
      if (key.indexOf('sb-') === 0 && key.lastIndexOf('-auth-token') === key.length - '-auth-token'.length) {
        var value = localStorage.getItem(key);
        if (value && value !== 'null') return true;
      }
    }
  } catch (e) {}
  return false;
}

/**
 * Fail-safe: any thrown error means "this is NOT the landing page", so the
 * baked markup is dropped and the app boots normally.
 */
export function isFastLanding() {
  try {
    var path = window.location.pathname;
    return (
      (path === '/' || path === '/landing') &&
      !isInstalledApp() &&
      !hasAuthHashOrQuery() &&
      !hasStoredAuthSession()
    );
  } catch (e) {
    return false;
  }
}
/* FAST_LANDING:END */
