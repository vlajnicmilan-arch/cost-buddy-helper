/**
 * Funnel event tracking — logs key user lifecycle events for the
 * acquisition/activation funnel.
 *
 * Events: install, signup, onboarding_complete, first_transaction,
 *         day7_active, paid_conversion
 *
 * Best-effort: never throws, never blocks the calling flow.
 * Dedup: DB has unique indexes per (user_id, event_name) for non-recurring
 * events, and per (session_id, 'install') for installs. Duplicate inserts
 * are silently ignored.
 */
import { supabase } from '@/integrations/supabase/client';

export type FunnelEventName =
  | 'install'
  | 'signup'
  | 'onboarding_complete'
  | 'first_transaction'
  | 'day7_active'
  | 'paid_conversion'
  | 'manual_merge_used'
  | 'onboarding_started'
  | 'onboarding_step_viewed'
  | 'onboarding_step_completed'
  | 'onboarding_step_skipped'
  | 'onboarding_abandoned'
  | 'checklist_viewed'
  | 'checklist_step_clicked'
  | 'checklist_dismissed'
  | 'checklist_completed'
  | 'guided_home_entered'
  | 'guided_home_exited'
  | 'worker_payout_attributed'
  // Pre-auth acquisition path (anonymous — no user_id, session_id only)
  | 'auth_page_viewed'
  | 'signup_form_started'
  | 'signup_submitted'
  | 'signup_failed'
  | 'login_attempted'
  | 'login_failed'
  | 'apk_download_started'
  | 'apk_download_failed';

/**
 * Events emitted before a user exists. They are inserted with user_id = NULL
 * and are matched by the RLS insert policy on `funnel_events`.
 */
export const ANONYMOUS_FUNNEL_EVENTS: ReadonlySet<string> = new Set([
  'auth_page_viewed',
  'signup_form_started',
  'signup_submitted',
  'signup_failed',
  'login_attempted',
  'login_failed',
  'apk_download_started',
  'apk_download_failed',
]);

const SESSION_KEY = 'funnel_session_id';
const INSTALL_FLAG = 'funnel_install_logged';
const UTM_KEY = 'funnel_utm';
const UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type UtmData = AttributionTags & {
  referrer?: string;
  landing_path?: string;
  captured_at?: number;
};

/**
 * Capture UTM params, ad click ids (fbclid/gclid) and the referrer from the
 * current URL into localStorage. Call once on app boot. First-touch
 * attribution: existing values are kept unless the URL carries new markers.
 */
export const captureUtmParams = (): void => {
  try {
    if (typeof window === 'undefined') return;
    const tags = extractAttributionTags(window.location.search);
    if (!hasAttributionMarkers(tags)) return;
    const incoming: UtmData = { ...tags };
    incoming.referrer = (document.referrer || '').slice(0, 300) || undefined;
    incoming.landing_path = window.location.pathname.slice(0, 200);
    incoming.captured_at = Date.now();
    localStorage.setItem(UTM_KEY, JSON.stringify(incoming));
  } catch {
    /* noop */
  }
};

const getStoredUtm = (): UtmData => {
  try {
    const raw = localStorage.getItem(UTM_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UtmData;
    if (parsed.captured_at && Date.now() - parsed.captured_at > UTM_TTL_MS) {
      localStorage.removeItem(UTM_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
};

/** First-touch acquisition tags stored on this device (empty when none/stale). */
export const readFirstTouchAttribution = (): UtmData => getStoredUtm();

const detectPlatform = (): string => {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      return cap.getPlatform?.() || 'native';
    }
    if (window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa';
    return 'web';
  } catch {
    return 'unknown';
  }
};

const getOrCreateSessionId = (): string => {
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return crypto.randomUUID();
  }
};

/**
 * Log a funnel event. Best-effort, never throws.
 * For 'install', user_id is omitted and session_id is used (anonymous).
 * For all other events, the current authenticated user is used.
 */
export const logFunnelEvent = async (
  eventName: FunnelEventName,
  metadata: Record<string, unknown> = {}
): Promise<void> => {
  try {
    const platform = detectPlatform();
    const sessionId = getOrCreateSessionId();
    const utm = getStoredUtm();
    const enrichedMetadata = { ...utm, ...metadata };

    if (eventName === 'install') {
      // Only log install once per device
      if (localStorage.getItem(INSTALL_FLAG) === '1') return;
      const { error } = await supabase.from('funnel_events').insert({
        user_id: null,
        session_id: sessionId,
        event_name: 'install',
        platform,
        metadata: enrichedMetadata as any,
      });
      // 23505 = unique violation → already logged, fine.
      if (!error || error.code === '23505') {
        try { localStorage.setItem(INSTALL_FLAG, '1'); } catch {}
      }
      return;
    }

    if (ANONYMOUS_FUNNEL_EVENTS.has(eventName)) {
      // Pre-auth: anonymous row keyed by session only. Never carries PII.
      await supabase.from('funnel_events').insert({
        user_id: null,
        session_id: sessionId,
        event_name: eventName,
        platform,
        metadata: enrichedMetadata as any,
      });
      return;
    }

    // All other events require an authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('funnel_events').insert({
      user_id: user.id,
      session_id: sessionId,
      event_name: eventName,
      platform,
      metadata: enrichedMetadata as any,
    });
    // Ignore duplicate-key errors silently — these events are idempotent per user.
  } catch (e) {
    // Never block on tracking failures
    if (typeof console !== 'undefined') {
      console.warn('[funnel] log failed', eventName, e);
    }
  }
};
