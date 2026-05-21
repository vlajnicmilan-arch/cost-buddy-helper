/**
 * Dashboard telemetry — best-effort, batched inserts into dashboard_telemetry.
 *
 * Events:
 *  - section_view  (dedup per session per section)
 *  - section_click
 *  - scroll_depth  (one per threshold 25/50/75/100 per session)
 *
 * Never throws, never blocks UI.
 */
import { supabase } from '@/integrations/supabase/client';

const SESSION_KEY = 'funnel_session_id';
const VIEW_SEEN_KEY = 'dash_tel_view_seen_v1';
const SCROLL_SEEN_KEY = 'dash_tel_scroll_seen_v1';

type EventType = 'section_view' | 'section_click' | 'scroll_depth';

interface Row {
  user_id: string | null;
  session_id: string;
  event_type: EventType;
  section: string;
  value: number | null;
  platform: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

const buffer: Row[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedUserId: string | null | undefined = undefined;

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

const getUserId = async (): Promise<string | null> => {
  if (cachedUserId !== undefined) return cachedUserId;
  try {
    const { data } = await supabase.auth.getUser();
    cachedUserId = data?.user?.id ?? null;
  } catch {
    cachedUserId = null;
  }
  return cachedUserId;
};

const flush = async () => {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await supabase.from('dashboard_telemetry').insert(batch as any);
  } catch {
    /* swallow */
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 2500);
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { void flush(); });
  window.addEventListener('beforeunload', () => { void flush(); });
}

const enqueue = async (
  event_type: EventType,
  section: string,
  value: number | null,
  metadata: Record<string, unknown> = {},
) => {
  try {
    const user_id = await getUserId();
    if (!user_id) return; // anonymous: skip — RLS allows but no value
    buffer.push({
      user_id,
      session_id: getSessionId(),
      event_type,
      section,
      value,
      platform: detectPlatform(),
      metadata,
      occurred_at: new Date().toISOString(),
    });
    scheduleFlush();
  } catch {
    /* noop */
  }
};

const readSeenSet = (key: string): Set<string> => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
};
const writeSeenSet = (key: string, set: Set<string>) => {
  try {
    sessionStorage.setItem(key, JSON.stringify([...set]));
  } catch { /* noop */ }
};

export const logDashboardView = (section: string) => {
  const seen = readSeenSet(VIEW_SEEN_KEY);
  if (seen.has(section)) return;
  seen.add(section);
  writeSeenSet(VIEW_SEEN_KEY, seen);
  void enqueue('section_view', section, null);
};

export const logDashboardClick = (section: string, metadata: Record<string, unknown> = {}) => {
  void enqueue('section_click', section, null, metadata);
};

export const logDashboardScrollDepth = (percent: 25 | 50 | 75 | 100) => {
  const seen = readSeenSet(SCROLL_SEEN_KEY);
  const key = String(percent);
  if (seen.has(key)) return;
  seen.add(key);
  writeSeenSet(SCROLL_SEEN_KEY, seen);
  void enqueue('scroll_depth', 'dashboard', percent);
};
