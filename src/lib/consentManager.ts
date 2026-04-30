/**
 * Cookie / Consent Manager — DSA + ePrivacy compliant.
 *
 * Categories:
 *  - necessary: always true (auth, RLS session, language pref, PIN). Cannot be disabled.
 *  - analytics: error monitoring (Sentry). Default OFF, opt-in only.
 *  - marketing: ad/tracking pixels. Default OFF, currently unused but reserved.
 *
 * Storage: single JSON blob in localStorage under CONSENT_KEY.
 * Listeners: dispatches `consent-changed` CustomEvent on window with new state.
 */

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string; // ISO date
  version: number;
}

const CONSENT_KEY = 'cookie_consent_v2';
const LEGACY_KEY = 'gdpr_consent_accepted';
const LEGACY_DATE = 'gdpr_consent_date';
const CONSENT_VERSION = 1;

export const CONSENT_EVENT = 'consent-changed';

const DEFAULT_REJECTED: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  decidedAt: '',
  version: CONSENT_VERSION,
};

export const getConsent = (): ConsentState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return { ...parsed, necessary: true };
  } catch {
    return null;
  }
};

export const hasDecidedConsent = (): boolean => getConsent() !== null;

export const hasConsent = (category: ConsentCategory): boolean => {
  if (category === 'necessary') return true;
  const c = getConsent();
  if (!c) return false;
  return !!c[category];
};

const persist = (state: ConsentState) => {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
    // Clean legacy keys.
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_DATE);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
  } catch {
    // ignore quota
  }
};

export const setConsent = (partial: { analytics?: boolean; marketing?: boolean }) => {
  const next: ConsentState = {
    necessary: true,
    analytics: !!partial.analytics,
    marketing: !!partial.marketing,
    decidedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  persist(next);
  return next;
};

export const acceptAll = () => setConsent({ analytics: true, marketing: true });
export const rejectAll = () => setConsent({ analytics: false, marketing: false });

export const onConsentChange = (cb: (state: ConsentState) => void): (() => void) => {
  const handler = (e: Event) => cb((e as CustomEvent<ConsentState>).detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
};

/**
 * Migrate legacy consent: old banner stored only "true". We respect that the
 * user dismissed the banner, but treat analytics/marketing as NOT consented
 * (opt-in default). User will not see the new banner if they had the old one.
 *
 * This keeps UX non-intrusive; for stricter compliance, remove this function
 * and let everyone re-decide.
 */
export const migrateLegacyConsent = (): void => {
  if (typeof window === 'undefined') return;
  if (getConsent()) return;
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === 'true') {
      const decidedAt = localStorage.getItem(LEGACY_DATE) || new Date().toISOString();
      persist({
        necessary: true,
        analytics: false,
        marketing: false,
        decidedAt,
        version: CONSENT_VERSION,
      });
    }
  } catch {
    // ignore
  }
};
