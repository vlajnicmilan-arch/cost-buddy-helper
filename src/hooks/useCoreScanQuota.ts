import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CoreScanQuotaState {
  loading: boolean;
  unlimited: boolean;
  remaining: number;
  count: number;
  resetAt: string | null;
  /** True samo za free korisnike koji su iscrpili kvotu. */
  exhausted: boolean;
}

const INITIAL: CoreScanQuotaState = {
  loading: true,
  unlimited: false,
  remaining: 3,
  count: 0,
  resetAt: null,
  exhausted: false,
};

/**
 * Cita stanje globalne Core scan kvote (3 / 30 dana) preko peek RPC-a.
 * Vraca i refresh() za rucni reload nakon scana.
 *
 * IMPORTANT: ne troši kvotu — to radi edge function preko consume RPC-a.
 */
export function useCoreScanQuota(): CoreScanQuotaState & { refresh: () => Promise<void> } {
  const { user } = useAuth();
  const [state, setState] = useState<CoreScanQuotaState>(INITIAL);

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ ...INITIAL, loading: false });
      return;
    }
    const { data, error } = await supabase.rpc('peek_core_scan_quota');
    if (error) {
      console.warn('[useCoreScanQuota] peek failed:', error.message);
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    const payload = (data ?? {}) as {
      unlimited?: boolean;
      remaining?: number;
      count?: number;
      reset_at?: string | null;
    };
    const unlimited = payload.unlimited === true;
    const remaining = unlimited ? Infinity : Math.max(0, payload.remaining ?? 0);
    setState({
      loading: false,
      unlimited,
      remaining: unlimited ? 999 : remaining,
      count: payload.count ?? 0,
      resetAt: payload.reset_at ?? null,
      exhausted: !unlimited && remaining <= 0,
    });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
