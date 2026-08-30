import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * MJESEČNA KVOTA UVOZA IZ MAILA (samo prikaz).
 *
 * Čita `public.mail_import_quota_status()` — istu granicu koju troši
 * `mail_import_consume_quota()` (5 bez prava `mail_uvoz`, 100 s njim).
 * Ovdje se ništa ne troši niti mijenja.
 */
export interface MailImportQuotaState {
  used: number;
  limit: number;
  loading: boolean;
}

/** Prvi dan sljedećeg mjeseca — trenutak kad se kvota obnavlja. */
export function quotaRenewalDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

export function useMailImportQuota(enabled: boolean) {
  const { user } = useAuth();
  const [state, setState] = useState<MailImportQuotaState>({ used: 0, limit: 0, loading: true });

  const refetch = useCallback(async () => {
    if (!enabled || !user?.id) {
      setState({ used: 0, limit: 0, loading: false });
      return;
    }
    const { data, error } = await supabase.rpc('mail_import_quota_status', { p_user_id: user.id });
    if (error) {
      console.warn('[useMailImportQuota] status failed:', error.message);
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const row = (data ?? {}) as { used?: number; limit?: number };
    setState({ used: Number(row.used ?? 0), limit: Number(row.limit ?? 0), loading: false });
  }, [enabled, user?.id]);

  useEffect(() => { refetch(); }, [refetch]);

  return { ...state, refetch };
}
