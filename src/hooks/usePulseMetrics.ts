/**
 * usePulseMetrics — aggregates `app_diagnostics_logs` into Pulse dashboard
 * metrics. Pulled in parallel queries; safe with RLS (admin only).
 *
 * Now severity-aware: counts and groups by critical/error/warning/info and
 * surfaces deduplicated "top issues" with affected user counts.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isChunkLoadError } from '@/lib/chunkLoadError';

export type PulseRange = '5min' | '1h' | '24h' | '7d';
export type PulseSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface PulseTopIssue {
  signature: string;
  event: string;
  message: string;
  route: string;
  severity: PulseSeverity;
  count: number;
  affectedUsers: number;
  affectedSessions: number;
  lastSeen: string;
  sampleDetails: Record<string, unknown> | null;
}

export interface PulseMetrics {
  activeSessions: number;
  errors1h: number;
  errors24h: number;
  /** counts in the last 1h, by severity */
  bySeverity1h: { critical: number; error: number; warning: number };
  /** counts in the last 24h, by severity */
  bySeverity24h: { critical: number; error: number; warning: number };
  topIssues: PulseTopIssue[];
  topRoutes: Array<{ route: string; errorCount: number; eventCount: number }>;
  versions: Array<{ version: string; sessions: number }>;
  perfByRoute: Array<{ route: string; samples: number; p50: number; p95: number }>;
  slowestActions: Array<{ action: string; duration_ms: number; route: string | null; created_at: string }>;
  loading: boolean;
  error: string | null;
}

const ERROR_EVENTS = ['window_error', 'unhandled_rejection', 'react_error_boundary', 'supabase_error', 'edge_function_error', 'notify_invoke_http_error'];
const IMPORTANT_SEVERITIES: PulseSeverity[] = ['critical', 'error', 'warning'];

const rangeToMs: Record<PulseRange, number> = {
  '5min': 5 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};

const emptySeverityCounts = () => ({ critical: 0, error: 0, warning: 0 });

export const usePulseMetrics = (range: PulseRange = '24h') => {
  const [metrics, setMetrics] = useState<PulseMetrics>({
    activeSessions: 0,
    errors1h: 0,
    errors24h: 0,
    bySeverity1h: emptySeverityCounts(),
    bySeverity24h: emptySeverityCounts(),
    topIssues: [],
    topRoutes: [],
    versions: [],
    perfByRoute: [],
    slowestActions: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setMetrics((m) => ({ ...m, loading: true, error: null }));
    try {
      const now = Date.now();
      const sinceRangeIso = new Date(now - rangeToMs[range]).toISOString();
      const since5minIso = new Date(now - 5 * 60_000).toISOString();
      const since1hIso = new Date(now - 60 * 60_000).toISOString();
      const since24hIso = new Date(now - 24 * 60 * 60_000).toISOString();

      // Active sessions in last 5 min
      const sessionsQ = supabase
        .from('app_diagnostics_logs')
        .select('session_id')
        .gte('created_at', since5minIso)
        .limit(2000);

      // Severity-bucketed error counts (1h) — fetch lightweight rows for client agg
      const sev1hQ = supabase
        .from('app_diagnostics_logs')
        .select('severity')
        .in('severity', IMPORTANT_SEVERITIES)
        .gte('created_at', since1hIso)
        .limit(5000);

      // Severity-bucketed error counts (24h)
      const sev24hQ = supabase
        .from('app_diagnostics_logs')
        .select('severity')
        .in('severity', IMPORTANT_SEVERITIES)
        .gte('created_at', since24hIso)
        .limit(10000);

      // Top issues — only critical+error in selected range
      const issuesQ = supabase
        .from('app_diagnostics_logs')
        .select('event, route, details, user_id, session_id, severity, created_at')
        .in('severity', ['critical', 'error'])
        .gte('created_at', sinceRangeIso)
        .order('created_at', { ascending: false })
        .limit(2000);

      // Range data — for routes/versions/perf aggregations
      const rangeDataQ = supabase
        .from('app_diagnostics_logs')
        .select('event, route, session_id, app_version, details, severity, created_at')
        .gte('created_at', sinceRangeIso)
        .limit(5000);

      const [sessRes, sev1hRes, sev24hRes, issuesRes, rangeRes] = await Promise.all([
        sessionsQ,
        sev1hQ,
        sev24hQ,
        issuesQ,
        rangeDataQ,
      ]);

      const activeSessions = sessRes.data
        ? new Set(sessRes.data.map((r: any) => r.session_id)).size
        : 0;

      // Severity counts
      const bySeverity1h = emptySeverityCounts();
      const bySeverity24h = emptySeverityCounts();
      for (const r of (sev1hRes.data ?? []) as any[]) {
        const s = r.severity as keyof typeof bySeverity1h;
        if (s in bySeverity1h) bySeverity1h[s] += 1;
      }
      for (const r of (sev24hRes.data ?? []) as any[]) {
        const s = r.severity as keyof typeof bySeverity24h;
        if (s in bySeverity24h) bySeverity24h[s] += 1;
      }

      // Backwards-compat: errors1h/24h = critical + error
      const errors1h = bySeverity1h.critical + bySeverity1h.error;
      const errors24h = bySeverity24h.critical + bySeverity24h.error;

      // Top issues — group critical+error by signature
      type Bucket = {
        signature: string;
        event: string;
        message: string;
        route: string;
        severity: PulseSeverity;
        count: number;
        users: Set<string>;
        sessions: Set<string>;
        lastSeen: string;
        sampleDetails: Record<string, unknown> | null;
      };
      const issueBuckets = new Map<string, Bucket>();
      for (const ev of (issuesRes.data ?? []) as any[]) {
        const message = String(ev.details?.message ?? ev.event);
        // Skip stale lazy-chunk errors — auto-recovered, not real issues.
        if (isChunkLoadError(message)) continue;
        const route = ev.route ?? '?';
        const sigKey = `${ev.event}::${message.slice(0, 200)}`;
        const occurrenceCount = Number(ev.details?.count ?? 1); // dedup count from logger

        let b = issueBuckets.get(sigKey);
        if (!b) {
          b = {
            signature: sigKey,
            event: ev.event,
            message,
            route,
            severity: ev.severity,
            count: 0,
            users: new Set<string>(),
            sessions: new Set<string>(),
            lastSeen: ev.created_at,
            sampleDetails: ev.details ?? null,
          };
          issueBuckets.set(sigKey, b);
        }
        b.count += occurrenceCount;
        if (ev.user_id) b.users.add(ev.user_id);
        if (ev.session_id) b.sessions.add(ev.session_id);
        // Critical wins severity
        if (ev.severity === 'critical') b.severity = 'critical';
        // Keep most-recent route/lastSeen (rows are ordered DESC so first set wins)
      }
      const topIssues: PulseTopIssue[] = [...issueBuckets.values()]
        .map((b) => ({
          signature: b.signature,
          event: b.event,
          message: b.message,
          route: b.route,
          severity: b.severity,
          count: b.count,
          affectedUsers: b.users.size,
          affectedSessions: b.sessions.size,
          lastSeen: b.lastSeen,
          sampleDetails: b.sampleDetails,
        }))
        .sort((a, b) => {
          // Critical first, then by affected users, then by count
          const sevRank = (s: PulseSeverity) => (s === 'critical' ? 0 : s === 'error' ? 1 : 2);
          const sevDiff = sevRank(a.severity) - sevRank(b.severity);
          if (sevDiff !== 0) return sevDiff;
          if (b.affectedUsers !== a.affectedUsers) return b.affectedUsers - a.affectedUsers;
          return b.count - a.count;
        })
        .slice(0, 10);

      // Routes / versions / perf aggregations from rangeRes
      const routeStats = new Map<string, { errorCount: number; eventCount: number }>();
      const versionStats = new Map<string, Set<string>>();
      const perfByRoute = new Map<string, number[]>();
      const slowest: Array<{ action: string; duration_ms: number; route: string | null; created_at: string }> = [];

      for (const ev of (rangeRes.data ?? []) as any[]) {
        const route = ev.route ?? '?';
        const stats = routeStats.get(route) ?? { errorCount: 0, eventCount: 0 };
        stats.eventCount += 1;
        if (ERROR_EVENTS.includes(ev.event) || ev.severity === 'error' || ev.severity === 'critical') {
          stats.errorCount += 1;
        }
        routeStats.set(route, stats);

        if (ev.app_version) {
          const set = versionStats.get(ev.app_version) ?? new Set<string>();
          set.add(ev.session_id);
          versionStats.set(ev.app_version, set);
        }

        if (ev.event === 'performance_metric' && ev.details?.duration_ms) {
          const arr = perfByRoute.get(route) ?? [];
          arr.push(Number(ev.details.duration_ms));
          perfByRoute.set(route, arr);

          slowest.push({
            action: String(ev.details.action ?? 'unknown'),
            duration_ms: Number(ev.details.duration_ms),
            route: ev.route,
            created_at: ev.created_at,
          });
        }
      }

      const topRoutes = [...routeStats.entries()]
        .map(([route, s]) => ({ route, ...s }))
        .sort((a, b) => b.errorCount - a.errorCount || b.eventCount - a.eventCount)
        .slice(0, 5);

      const versions = [...versionStats.entries()]
        .map(([version, set]) => ({ version, sessions: set.size }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 8);

      const perfStats = [...perfByRoute.entries()]
        .map(([route, arr]) => {
          const sorted = [...arr].sort((a, b) => a - b);
          const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
          const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
          return { route, samples: arr.length, p50: Math.round(p50), p95: Math.round(p95) };
        })
        .sort((a, b) => b.p95 - a.p95)
        .slice(0, 5);

      const slowestActions = slowest
        .sort((a, b) => b.duration_ms - a.duration_ms)
        .slice(0, 5);

      setMetrics({
        activeSessions,
        errors1h,
        errors24h,
        bySeverity1h,
        bySeverity24h,
        topIssues,
        topRoutes,
        versions,
        perfByRoute: perfStats,
        slowestActions,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setMetrics((m) => ({ ...m, loading: false, error: e?.message ?? String(e) }));
    }
  }, [range]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { ...metrics, refresh };
};
