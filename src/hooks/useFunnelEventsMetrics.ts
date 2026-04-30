/**
 * useFunnelEventsMetrics — admin-only.
 * Aggregates the 6 standardised funnel events into a step-by-step
 * conversion lijevak.
 *
 * Steps: install → signup → onboarding_complete → first_transaction
 *        → day7_active → paid_conversion
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FunnelEventName =
  | 'install'
  | 'signup'
  | 'onboarding_complete'
  | 'first_transaction'
  | 'day7_active'
  | 'paid_conversion';

export interface FunnelStep {
  name: FunnelEventName;
  count: number;
  conversionFromPrev: number; // % from previous step
  conversionFromTop: number;  // % from install
}

export interface FunnelEventsMetrics {
  steps: FunnelStep[];
  totalEvents: number;
  loading: boolean;
  error: string | null;
}

const ORDER: FunnelEventName[] = [
  'install',
  'signup',
  'onboarding_complete',
  'first_transaction',
  'day7_active',
  'paid_conversion',
];

export const useFunnelEventsMetrics = (rangeDays: number = 30) => {
  const [data, setData] = useState<FunnelEventsMetrics>({
    steps: [],
    totalEvents: 0,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setData((d) => ({ ...d, loading: true, error: null }));
    try {
      const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

      // Fetch event counts per name. We count distinct identifiers per event:
      //   - install    → distinct session_id (anonymous)
      //   - others     → distinct user_id
      // Pull only the columns we need.
      const { data: rows, error } = await supabase
        .from('funnel_events')
        .select('event_name, user_id, session_id')
        .gte('occurred_at', since);
      if (error) throw error;

      const buckets: Record<FunnelEventName, Set<string>> = {
        install: new Set(),
        signup: new Set(),
        onboarding_complete: new Set(),
        first_transaction: new Set(),
        day7_active: new Set(),
        paid_conversion: new Set(),
      };

      for (const r of rows ?? []) {
        const name = r.event_name as FunnelEventName;
        if (!ORDER.includes(name)) continue;
        const key = name === 'install'
          ? (r.session_id ?? r.user_id ?? '')
          : (r.user_id ?? '');
        if (key) buckets[name].add(key);
      }

      const steps: FunnelStep[] = ORDER.map((name, idx) => {
        const count = buckets[name].size;
        const top = buckets[ORDER[0]].size;
        const prev = idx === 0 ? count : buckets[ORDER[idx - 1]].size;
        return {
          name,
          count,
          conversionFromPrev: prev > 0 ? Math.round((count / prev) * 1000) / 10 : 0,
          conversionFromTop: top > 0 ? Math.round((count / top) * 1000) / 10 : 0,
        };
      });

      setData({
        steps,
        totalEvents: rows?.length ?? 0,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setData((d) => ({ ...d, loading: false, error: e?.message ?? String(e) }));
    }
  }, [rangeDays]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { ...data, refresh };
};
