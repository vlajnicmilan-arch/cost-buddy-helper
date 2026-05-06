/**
 * notifyCrash — fire-and-forget poziv na notify-crash edge funkciju.
 *
 * Koristi `fetch` s `keepalive: true` da preživi navigaciju/unmount, isti pattern
 * kao notifyHelper.ts. Ne baca, ne loguje stack — samo console.warn ako padne,
 * jer ne smije srušiti recovery flow.
 *
 * Funkcija je verify_jwt=false pa ne treba access token; služi i za crashove
 * prije nego što je sesija dostupna.
 */

import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface NotifyCrashPayload {
  source: 'error_boundary' | 'window_error' | 'unhandled_rejection';
  message: string;
  stack?: string;
  componentStack?: string;
  route?: string;
  appVersion?: string;
  platform?: string;
}

// Local in-memory dedup (per session) — same signature in same hour goes once.
const recentSignatures = new Map<string, number>();
const DEDUP_MS = 60 * 60 * 1000; // 1h

function buildSignature(p: NotifyCrashPayload): string {
  const msg = (p.message || '').split('\n')[0].trim().slice(0, 200).toLowerCase();
  return `${p.source}|${p.route ?? '?'}|${msg}`;
}

export function notifyCrash(payload: NotifyCrashPayload): void {
  try {
    const sig = buildSignature(payload);
    const last = recentSignatures.get(sig);
    if (last && Date.now() - last < DEDUP_MS) return;
    recentSignatures.set(sig, Date.now());

    // Best-effort userId
    let userId: string | null = null;
    try {
      // sync read of cached session — no await to avoid blocking recovery
      const session = (supabase.auth as any).currentSession ?? null;
      userId = session?.user?.id ?? null;
    } catch {
      /* ignore */
    }

    const url = `${SUPABASE_URL}/functions/v1/notify-crash`;
    const body = JSON.stringify({
      ...payload,
      userId,
      route: payload.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
      platform: payload.platform ?? (typeof navigator !== 'undefined' ? navigator.platform : undefined),
    });

    // Fire-and-forget; keepalive ensures it survives unmount.
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow — never break recovery */
    });
  } catch (e) {
    console.warn('[notifyCrash] failed to invoke', e);
  }
}
