/**
 * Embedded (in-app) browser detection from the user agent string.
 *
 * Used for funnel telemetry only — never logs the full user agent, only a
 * short hint. Pure and defensive: works even when navigator/userAgent are
 * unavailable.
 */

export interface EmbeddedBrowserInfo {
  embedded: boolean;
  hint: 'facebook' | 'instagram' | 'line' | 'wechat' | 'other' | 'none' | 'unknown';
}

export const detectEmbeddedBrowser = (
  userAgent?: string | null,
): EmbeddedBrowserInfo => {
  let ua = userAgent;
  if (ua === undefined) {
    try {
      ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
    } catch {
      ua = null;
    }
  }
  if (!ua) return { embedded: false, hint: 'unknown' };

  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { embedded: true, hint: 'facebook' };
  if (/Instagram/i.test(ua)) return { embedded: true, hint: 'instagram' };
  if (/Line\//i.test(ua)) return { embedded: true, hint: 'line' };
  if (/MicroMessenger/i.test(ua)) return { embedded: true, hint: 'wechat' };

  return { embedded: false, hint: 'none' };
};
