/**
 * Diagnostic Logger
 *
 * Sends lightweight diagnostic events to the `app_diagnostics_logs` Supabase
 * table so we can debug what happens on real user devices (especially APK
 * builds) in real time from the Admin panel.
 *
 * - Generates a session_id once per app boot.
 * - Buffers events and flushes every 2s or when 5+ events are queued.
 * - Auto-classifies severity (critical/error/warning/info) when not provided.
 * - In-memory deduplication: identical events within 60s are collapsed into
 *   a single row with `details.count` instead of spamming the table.
 * - Failures are silent: the logger must NEVER break the app.
 */
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';

export type DiagnosticSeverity = 'critical' | 'error' | 'warning' | 'info';

interface DiagnosticEventInput {
  event: string;
  details?: Record<string, unknown>;
  route?: string;
  severity?: DiagnosticSeverity;
}

interface DiagnosticEventRow {
  session_id: string;
  user_id: string | null;
  event: string;
  route: string | null;
  details: Record<string, unknown> | null;
  device_info: Record<string, unknown> | null;
  app_version: string | null;
  severity: DiagnosticSeverity;
  created_at: string;
}

const SESSION_KEY = 'vmb-diagnostic-session-id';

const generateSessionId = (): string => {
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

// ----- Severity auto-classification -----
const ERROR_EVENT_NAMES = new Set([
  'window_error',
  'unhandled_rejection',
  'react_error_boundary',
  'supabase_error',
  'edge_function_error',
  'notify_invoke_http_error',
]);

const CRITICAL_EVENT_NAMES = new Set([
  'react_error_boundary',
  'app_crash',
]);

const classifySeverity = (event: string, details?: Record<string, unknown>): DiagnosticSeverity => {
  if (CRITICAL_EVENT_NAMES.has(event)) return 'critical';
  if (ERROR_EVENT_NAMES.has(event)) return 'error';
  if (event === 'performance_metric') {
    const dur = Number(details?.duration_ms ?? 0);
    if (dur > 5000) return 'warning';
    return 'info';
  }
  return 'info';
};

// ----- Deduplication (in-memory) -----
const DEDUP_WINDOW_MS = 60_000;
interface DedupEntry {
  row: DiagnosticEventRow; // pointer to the row in `buffer` so we can mutate count
  firstSeen: number;
}
const dedupMap = new Map<string, DedupEntry>();

const buildSignature = (row: DiagnosticEventRow): string => {
  const msg = (row.details && typeof row.details === 'object' && 'message' in row.details)
    ? String((row.details as any).message ?? '')
    : '';
  // Include action for performance_metric so different slow actions don't collapse
  const action = (row.details && typeof row.details === 'object' && 'action' in row.details)
    ? String((row.details as any).action ?? '')
    : '';
  return `${row.event}::${row.severity}::${row.route ?? ''}::${msg.slice(0, 200)}::${action}`;
};

const cleanupDedup = (now: number) => {
  for (const [key, entry] of dedupMap) {
    if (now - entry.firstSeen > DEDUP_WINDOW_MS) {
      dedupMap.delete(key);
    }
  }
};

let buffer: DiagnosticEventRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedUserId: string | null = null;

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
  // Clear dedup map references — once flushed, a new occurrence starts fresh.
  dedupMap.clear();

  try {
    const { error } = await supabase.from('app_diagnostics_logs').insert(batch as any);
    if (error) {
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

    const severity = payload.severity ?? classifySeverity(payload.event, payload.details);

    const row: DiagnosticEventRow = {
      session_id: SESSION_ID,
      user_id: cachedUserId,
      event: payload.event,
      route: payload.route ?? (typeof window !== 'undefined' ? window.location.pathname : null),
      details: payload.details ?? null,
      device_info: getDeviceInfo(),
      app_version: APP_VERSION ?? null,
      severity,
      created_at: new Date().toISOString(),
    };

    // Mirror to console for live debugging.
    const prefix = severity === 'critical' ? '🔴' : severity === 'error' ? '🟠' : severity === 'warning' ? '🟡' : '·';
    console.log(`${prefix} [Diag:${payload.event}]`, payload.details ?? '');

    // ----- Deduplication -----
    const now = Date.now();
    cleanupDedup(now);
    const sig = buildSignature(row);
    const existing = dedupMap.get(sig);

    if (existing && (now - existing.firstSeen) < DEDUP_WINDOW_MS) {
      // Increment count on the existing buffered row instead of pushing a new one.
      const cur = existing.row.details ?? {};
      const prevCount = Number((cur as any).count ?? 1);
      existing.row.details = { ...cur, count: prevCount + 1, last_seen: row.created_at };
      // Don't push, don't schedule a fresh flush — the existing scheduled one will send it.
      return;
    }

    // First occurrence — push and remember.
    if (row.details === null) row.details = {};
    (row.details as any).count = 1;
    dedupMap.set(sig, { row, firstSeen: now });
    buffer.push(row);

    if (buffer.length >= 5) {
      void flush();
    } else {
      scheduleFlush();
    }
  } catch (e) {
    console.warn('[Diagnostics] logDiagnostic failed:', e);
  }
};

export const getDiagnosticSessionId = () => SESSION_ID;

/**
 * Log a performance metric. Severity is auto-set to 'warning' for >5s,
 * otherwise 'info'.
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
 * Wrap an async function and automatically log its duration.
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
    logDiagnostic({
      event: 'window_error',
      severity: 'error',
      details: {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    if (reason?.name === 'AbortError') return;
    const msg = typeof reason?.message === 'string' ? reason.message : String(reason ?? '');
    if (msg.includes('signal is aborted') || msg.includes('aborted without reason')) return;
    // Filter known-benign Capacitor plugin-not-implemented errors
    // (e.g. Haptics on Android builds where the plugin isn't registered).
    if (msg.includes('is not implemented on') || msg.includes('UNIMPLEMENTED')) return;

    logDiagnostic({
      event: 'unhandled_rejection',
      severity: 'error',
      details: {
        message: reason?.message ?? String(reason),
        stack: typeof reason?.stack === 'string' ? reason.stack.slice(0, 2000) : undefined,
      },
    });
  });
}
