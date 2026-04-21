/**
 * usePulseMetrics — aggregates `app_diagnostics_logs` into Pulse dashboard
 * metrics. Pulled in parallel queries; safe with RLS (admin only).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PulseRange = '5min' | '1h' | '24h' | '7d';

export interface PulseMetrics {
  activeSessions: number;
  errors1h: number;
  errors24h: number;
  topRoutes: Array<{ route: string; errorCount: number; eventCount: number }>;
  versions: Array<{ version: string; sessions: number }>;
  perfByRoute: Array<{ route: string; samples: number; p50: number; p95: number }>;
  slowestActions: Array<{ action: string; duration_ms: number; route: string | null; created_at: string }>;
  loading: boolean;
  error: string | null;
}

const ERROR_EVENTS = ['window_error', 'unhandled_rejection'];

const rangeToMs: Record<PulseRange, number> = {
  '5min': 5 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};

export const usePulseMetrics = (range: PulseRange = '24h') => {
  const [metrics, setMetrics] = useState<PulseMetrics>({
    activeSessions: 0,
    errors1h: 0,
    errors24h: 0,
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

      // Errors 1h
      const err1hQ = supabase
        .from('app_diagnostics_logs')
        .select('id', { count: 'exact', head: true })
        .in('event', ERROR_EVENTS)
        .gte('created_at', since1hIso);

      // Errors 24h
      const err24hQ = supabase
        .from('app_diagnostics_logs')
        .select('id', { count: 'exact', head: true })
        .in('event', ERROR_EVENTS)
        .gte('created_at', since24hIso);

      // Range data — aggregations done client-side
      const rangeDataQ = supabase
        .from('app_diagnostics_logs')
        .select('event, route, session_id, app_version, details, created_at')
        .gte('created_at', sinceRangeIso)
        .limit(5000);

      const [sessRes, err1hRes, err24hRes, rangeRes] = await Promise.all([
        sessionsQ,
        err1hQ,
        err24hQ,
        rangeDataQ,
      ]);

      const activeSessions = sessRes.data
        ? new Set(sessRes.data.map((r: any) => r.session_id)).size
        : 0;

      // Aggregations
      const routeStats = new Map<string, { errorCount: number; eventCount: number }>();
      const versionStats = new Map<string, Set<string>>();
      const perfByRoute = new Map<string, number[]>();
      const slowest: Array<{ action: string; duration_ms: number; route: string | null; created_at: string }> = [];

      for (const ev of (rangeRes.data ?? []) as any[]) {
        const route = ev.route ?? '?';
        const stats = routeStats.get(route) ?? { errorCount: 0, eventCount: 0 };
        stats.eventCount += 1;
        if (ERROR_EVENTS.includes(ev.event)) stats.errorCount += 1;
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
        errors1h: err1hRes.count ?? 0,
        errors24h: err24hRes.count ?? 0,
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
