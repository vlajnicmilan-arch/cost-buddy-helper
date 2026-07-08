import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface WorkerEarningsPreview {
  hours: number;
  gross: number;
  period_start: string;
  period_end: string;
}

/**
 * Historically-accurate preview of a worker's earnings for a period.
 *
 * Wraps the `preview_worker_earnings` SECURITY DEFINER RPC. The RPC applies
 * per-day rate_at() so retroactive rate changes stay correct — same logic as
 * `create_worker_payout`, only without writing.
 *
 * Authorised for the project owner and for the linked worker (user_id match).
 * Anonymous callers get 42501.
 */
export const useWorkerEarningsPreview = (
  workerId: string | null,
  projectId: string | null,
  periodStart: string | null, // ISO date YYYY-MM-DD
  periodEnd: string | null,
) => {
  const { user } = useAuth();
  const [data, setData] = useState<WorkerEarningsPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!user || !workerId || !projectId || !periodStart || !periodEnd) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: rpcErr } = await (supabase.rpc as any)(
        'preview_worker_earnings',
        {
          p_worker_id: workerId,
          p_project_id: projectId,
          p_period_start: periodStart,
          p_period_end: periodEnd,
        },
      );
      if (rpcErr) throw rpcErr;
      const parsed = res
        ? {
            hours: Number((res as any).hours) || 0,
            gross: Number((res as any).gross) || 0,
            period_start: (res as any).period_start,
            period_end: (res as any).period_end,
          }
        : null;
      setData(parsed);
    } catch (err: any) {
      // Swallow — MyWorkerPayCard falls back to hourlyRate*hours display when
      // preview is unavailable (permission, network). Log for diagnostics.
      // eslint-disable-next-line no-console
      console.warn('[useWorkerEarningsPreview] rpc failed', err?.message ?? err);
      setError(err?.message ?? 'preview failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, workerId, projectId, periodStart, periodEnd]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  return { data, loading, error, refetch: fetchPreview };
};
