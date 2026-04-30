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
  | 'paid_conversion';

const SESSION_KEY = 'funnel_session_id';
const INSTALL_FLAG = 'funnel_install_logged';

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

    if (eventName === 'install') {
      // Only log install once per device
      if (localStorage.getItem(INSTALL_FLAG) === '1') return;
      const { error } = await supabase.from('funnel_events').insert({
        user_id: null,
        session_id: sessionId,
        event_name: 'install',
        platform,
        metadata: metadata as any,
      });
      // 23505 = unique violation → already logged, fine.
      if (!error || error.code === '23505') {
        try { localStorage.setItem(INSTALL_FLAG, '1'); } catch {}
      }
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
      metadata: metadata as any,
    });
    // Ignore duplicate-key errors silently — these events are idempotent per user.
  } catch (e) {
    // Never block on tracking failures
    if (typeof console !== 'undefined') {
      console.warn('[funnel] log failed', eventName, e);
    }
  }
};
