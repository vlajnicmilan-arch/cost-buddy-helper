/**
 * useFreeTierUsage — čita server-side "increment-only" brojač iz
 * `free_tier_usage_monthly` (RPC `get_free_tier_usage_current_month`).
 *
 * Ključno: brojač raste na INSERT expensea, a NE PADA na DELETE.
 * Klijentska heuristika (brojanje `expenses[]`) je stoga netočna kada
 * user obriše transakciju — otud odvojeni izvor istine.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface FreeTierUsage {
  transactions_created: number;
  month_key: string;
}

export function useFreeTierUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<FreeTierUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setUsage(null);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_free_tier_usage_current_month');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setUsage({
        transactions_created: Number(row?.transactions_created ?? 0),
        month_key: String(row?.month_key ?? ''),
      });
    } catch (err) {
      // Fail-safe: 0 (dopušta pisanje ako server odbije, server ima svoj trigger)
      console.warn('[useFreeTierUsage] RPC failed:', err);
      setUsage({ transactions_created: 0, month_key: '' });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { usage, loading, refetch };
}
