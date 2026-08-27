/**
 * useActiveUserCounts — admin-only. Real "active users" numbers for Pulse.
 *
 * Primary path: `get_admin_active_user_counts()` RPC (returns only two
 * aggregate numbers, no identities). Fallback: direct read of
 * `user_login_logs` (admin RLS policy already allows it) aggregated client-side.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { computeActiveUserCounts, type LoginLogRow } from '@/lib/activeUserCounts';

export const useActiveUserCounts = () => {
  const [state, setState] = useState({
    active24h: 0,
    active7d: 0,
    loading: true,
    error: null as string | null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data, error } = await supabase.rpc('get_admin_active_user_counts' as never);
      if (!error && data) {
        const d = data as unknown as { active_users_24h: number; active_users_7d: number };
        setState({
          active24h: Number(d.active_users_24h ?? 0),
          active7d: Number(d.active_users_7d ?? 0),
          loading: false,
          error: null,
        });
        return;
      }

      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows, error: rowsError } = await supabase
        .from('user_login_logs')
        .select('user_id, logged_in_at')
        .gte('logged_in_at', since7d)
        .limit(20000);
      if (rowsError) throw rowsError;

      const counts = computeActiveUserCounts((rows ?? []) as LoginLogRow[]);
      setState({ ...counts, loading: false, error: null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { ...state, refresh };
};
