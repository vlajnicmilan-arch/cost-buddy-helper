/**
 * Landing page telemetry — anonymous, best-effort, batched inserts into
 * `landing_events`.
 *
 * Events:
 *  - page_view     (once per session per path)
 *  - section_view  (dedup per session per section)
 *  - cta_click     (primary/ghost buttons)
 *  - link_click    (any other anchor)
 *  - scroll_depth  (one per threshold 25/50/75/100 per session)
 *  - lang_change / theme_change
 *  - time_on_page  (seconds, flushed on pagehide)
 *
 * Never throws, never blocks the page.
 */
import { supabase } from '@/integrations/supabase/client';

const SESSION_KEY = 'funnel_session_id';
const SEEN_KEY = 'landing_tel_seen_v1';

export type LandingEventType =
  | 'page_view'
  | 'section_view'
  | 'cta_click'
  | 'link_click'
  | 'scroll_depth'
  | 'lang_change'
  | 'theme_change'
  | 'time_on_page';

export interface LandingRow {
  session_id: string;
  event_type: LandingEventType;
  target: string | null;
  value: number | null;
  lang: string | null;
  theme: string | null;
  platform: string;
  path: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

/* ---------- pure helpers (unit-tested) ---------- */

/** Normalise arbitrary label text into a short stable slug. */
export const slugifyTarget = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export interface ClickDescriptor {
  eventType: 'cta_click' | 'link_click';
  target: string;
  href: string;
}

/**
 * Decide what a click on an anchor inside the landing means.
 * Returns null when the click is not on an anchor we care about.
 */
export const describeAnchorClick = (
  anchor: { href: string; className: string; text: string } | null,
): ClickDescriptor | null => {
  if (!anchor) return null;
  const href = (anchor.href || '').slice(0, 300);
  const classes = anchor.className || '';
  const isCta = /\bbtn\b/.test(classes);
  const label = slugifyTarget(anchor.text || '') || slugifyTarget(href) || 'unknown';
  return {
    eventType: isCta ? 'cta_click' : 'link_click',
    target: label,
    href,
  };
};

/** Highest crossed threshold for a scroll percentage, or null. */
export const scrollThreshold = (pct: number): 25 | 50 | 75 | 100 | null => {
  if (pct >= 100) return 100;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  if (pct >= 25) return 25;
  return null;
};

/* ---------- runtime ---------- */

const buffer: LandingRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let firstBatchScheduled = false;
let exitFlushed = false;
let context: { lang: string; theme: string } = { lang: 'hr', theme: 'dark' };

/** First batch leaves almost immediately so bouncing visitors are counted. */
export const FIRST_FLUSH_DELAY_MS = 300;
export const FLUSH_DELAY_MS = 2500;

export const setLandingContext = (lang: string, theme: string) => {
  context = { lang, theme };
};

const detectPlatform = (): string => {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) return cap.getPlatform?.() || 'native';
    if (window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa';
    return 'web';
  } catch {
    return 'unknown';
  }
};

const getSessionId = (): string => {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'anon';
  }
};

const flush = async () => {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await supabase.from('landing_events').insert(batch as any);
  } catch {
    /* swallow */
  }
};

/**
 * Flush during page teardown. Uses fetch(keepalive) so the request survives the
 * tab closing. Rows are never re-queued and never retried.
 */
const flushOnExit = () => {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key || typeof fetch !== 'function') return;
    void fetch(`${url}/rest/v1/landing_events`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(batch),
    }).catch(() => {
      /* dropped on purpose */
    });
  } catch {
    /* dropped on purpose */
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  const delay = firstBatchScheduled ? FLUSH_DELAY_MS : FIRST_FLUSH_DELAY_MS;
  firstBatchScheduled = true;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, delay);
};


const readSeen = (): Set<string> => {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
};
const writeSeen = (set: Set<string>) => {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
};
/** Returns true the first time a key is seen in this session. */
const firstTime = (key: string): boolean => {
  const seen = readSeen();
  if (seen.has(key)) return false;
  seen.add(key);
  writeSeen(seen);
  return true;
};

const enqueue = (
  event_type: LandingEventType,
  target: string | null,
  value: number | null = null,
  metadata: Record<string, unknown> = {},
) => {
  try {
    buffer.push({
      session_id: getSessionId(),
      event_type,
      target,
      value,
      lang: context.lang,
      theme: context.theme,
      platform: detectPlatform(),
      path: (typeof window !== 'undefined' ? window.location.pathname : '/').slice(0, 200),
      metadata,
      occurred_at: new Date().toISOString(),
    });
    scheduleFlush();
  } catch {
    /* noop */
  }
};

export const logLandingPageView = (metadata: Record<string, unknown> = {}) => {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (!firstTime(`pv:${path}`)) return;
  enqueue('page_view', path, null, metadata);
};

export const logLandingSectionView = (section: string) => {
  if (!firstTime(`sv:${section}`)) return;
  enqueue('section_view', section);
};

export const logLandingClick = (d: ClickDescriptor) => {
  enqueue(d.eventType, d.target, null, { href: d.href });
};

export const logLandingScroll = (pct: 25 | 50 | 75 | 100) => {
  if (!firstTime(`sd:${pct}`)) return;
  enqueue('scroll_depth', 'landing', pct);
};

export const logLandingLangChange = (lang: string) => {
  enqueue('lang_change', lang);
};

export const logLandingThemeChange = (theme: string) => {
  enqueue('theme_change', theme);
};

export const logLandingTimeOnPage = (seconds: number) => {
  if (seconds <= 0) return;
  enqueue('time_on_page', 'landing', Math.min(seconds, 3600));
};

export const flushLandingTelemetry = () => {
  void flush();
};

/** Flush once during teardown (pagehide / visibilitychange → hidden). */
export const flushLandingTelemetryOnExit = () => {
  if (exitFlushed) return;
  exitFlushed = true;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushOnExit();
};

/** Test-only reset of module state. */
export const __resetLandingTelemetry = () => {
  buffer.length = 0;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  firstBatchScheduled = false;
  exitFlushed = false;
};

