/**
 * Diagnostic Logger
 *
 * Sends lightweight diagnostic events to the `app_diagnostics_logs` Supabase
 * table so we can debug what happens on real user devices (especially APK
 * builds) in real time from the Admin panel.
 *
 * - Generates a session_id once per app boot.
 * - Buffers events and flushes every 2s or when 5+ events are queued.
 * - Failures are silent: the logger must NEVER break the app.
 */
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';

interface DiagnosticEventInput {
  event: string;
  details?: Record<string, unknown>;
  route?: string;
}

interface DiagnosticEventRow {
  session_id: string;
  user_id: string | null;
  event: string;
  route: string | null;
  details: Record<string, unknown> | null;
  device_info: Record<string, unknown> | null;
  app_version: string | null;
  created_at: string;
}

const SESSION_KEY = 'vmb-diagnostic-session-id';

const generateSessionId = (): string => {
  // Stable per app session (memory). We also persist to sessionStorage so a
  // soft reload keeps the same id, but a fresh app cold start gets a new id.
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
  } catch {
    /* ignore */
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
};

const SESSION_ID = generateSessionId();

const getDeviceInfo = (): Record<string, unknown> => {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return {
    ua: navigator.userAgent,
    platform: cap?.getPlatform?.() ?? 'web',
    isCapacitor: !!cap?.isNativePlatform?.(),
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    lang: navigator.language,
    online: navigator.onLine,
    href: window.location.href,
  };
};

let buffer: DiagnosticEventRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedUserId: string | null = null;

// Try to keep a cached user id so we don't await getUser() for every event.
supabase.auth.getUser().then(({ data }) => {
  cachedUserId = data.user?.id ?? null;
}).catch(() => {
  /* ignore */
});

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id ?? null;
});

const flush = async () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;

  const batch = buffer;
  buffer = [];

  try {
    const { error } = await supabase.from('app_diagnostics_logs').insert(batch as any);
    if (error) {
      // Don't retry — keep the logger lightweight. Just log to console.
      console.warn('[Diagnostics] flush failed:', error.message);
    }
  } catch (e) {
    console.warn('[Diagnostics] flush threw:', e);
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush();
  }, 2000);
};

export const logDiagnostic = (input: DiagnosticEventInput | string, details?: Record<string, unknown>) => {
  try {
    const payload: DiagnosticEventInput =
      typeof input === 'string' ? { event: input, details } : input;

    const row: DiagnosticEventRow = {
      session_id: SESSION_ID,
      user_id: cachedUserId,
      event: payload.event,
      route: payload.route ?? (typeof window !== 'undefined' ? window.location.pathname : null),
      details: payload.details ?? null,
      device_info: getDeviceInfo(),
      app_version: APP_VERSION ?? null,
      created_at: new Date().toISOString(),
    };

    // Mirror to console for live debugging.
    console.log(`[Diag:${payload.event}]`, payload.details ?? '');

    buffer.push(row);

    if (buffer.length >= 5) {
      void flush();
    } else {
      scheduleFlush();
    }
  } catch (e) {
    // Logger must never break the app.
    console.warn('[Diagnostics] logDiagnostic failed:', e);
  }
};

export const getDiagnosticSessionId = () => SESSION_ID;

/**
 * Log a performance metric (page load, slow action, etc.) into the same
 * `app_diagnostics_logs` table under event = 'performance_metric'.
 * Lightweight — uses the same buffer/flush pipeline.
 */
export const logPerformance = (
  action: string,
  durationMs: number,
  metadata?: Record<string, unknown>
) => {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  logDiagnostic('performance_metric', {
    action,
    duration_ms: Math.round(durationMs),
    ...(metadata ?? {}),
  });
};

/**
 * Wrap an async function and automatically log its duration as a performance
 * metric. Only logs when duration exceeds the threshold (default 2000 ms) to
 * keep the diagnostics table noise-free.
 */
export const withPerfTracking = async <T>(
  action: string,
  fn: () => Promise<T>,
  options?: { thresholdMs?: number; metadata?: Record<string, unknown> }
): Promise<T> => {
  const threshold = options?.thresholdMs ?? 2000;
  const start = performance.now();
  try {
    const result = await fn();
    const dur = performance.now() - start;
    if (dur >= threshold) {
      logPerformance(action, dur, options?.metadata);
    }
    return result;
  } catch (err) {
    const dur = performance.now() - start;
    if (dur >= threshold) {
      logPerformance(action, dur, { ...(options?.metadata ?? {}), failed: true });
    }
    throw err;
  }
};

// ----- Auto page-load timing -----
if (typeof window !== 'undefined' && 'performance' in window) {
  // After full load, capture navigation timing once.
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const nav = navEntries[0];
        if (!nav) return;
        const loadDuration = nav.loadEventEnd - nav.startTime;
        if (loadDuration > 0 && loadDuration < 60_000) {
          logPerformance('page_load', loadDuration, {
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
            ttfb: Math.round(nav.responseStart - nav.startTime),
          });
        }
      } catch {
        /* ignore */
      }
    }, 0);
  });
}

// Best-effort flush before the page unloads.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void flush();
  });
  window.addEventListener('pagehide', () => {
    void flush();
  });

  // Capture global errors automatically.
  window.addEventListener('error', (e) => {
    logDiagnostic('window_error', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    logDiagnostic('unhandled_rejection', {
      message: reason?.message ?? String(reason),
      stack: reason?.stack,
    });
  });
}
