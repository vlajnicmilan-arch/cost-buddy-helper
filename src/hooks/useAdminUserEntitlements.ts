/**
 * Admin — čitanje i prebacivanje prava po modulu u `user_entitlements`.
 *
 * Čitanje ide izravno (RLS dopušta adminu SELECT), upis kroz edge funkciju
 * `admin-set-entitlement` (tablica nema write policy).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ADMIN_ENTITLEMENT_MODULES,
  buildSetEntitlementPayload,
  deriveModuleState,
  type AdminEntitlementModule,
  type EntitlementRowLike,
  type ModuleEntitlementState,
} from '@/lib/adminEntitlements';

export function useAdminUserEntitlements(userId: string | null | undefined) {
  const [rows, setRows] = useState<EntitlementRowLike[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyModule, setBusyModule] = useState<AdminEntitlementModule | null>(null);

  const fetchRows = useCallback(async () => {
    if (!userId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_entitlements')
      .select('module, source, status, period_end')
      .eq('user_id', userId);
    if (error) {
      console.warn('[useAdminUserEntitlements] fetch error:', error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as EntitlementRowLike[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const setModule = useCallback(
    async (module: AdminEntitlementModule, enabled: boolean, expiresAt: string | null) => {
      if (!userId) throw new Error('no_target_user');
      setBusyModule(module);
      try {
        const payload = buildSetEntitlementPayload({ userId, module, enabled, expiresAt });
        const { data, error } = await supabase.functions.invoke('admin-set-entitlement', {
          body: payload,
        });
        if (error) throw error;
        if (data?.rows) setRows(data.rows as EntitlementRowLike[]);
        else await fetchRows();
      } finally {
        setBusyModule(null);
      }
    },
    [userId, fetchRows],
  );

  const states: ModuleEntitlementState[] = ADMIN_ENTITLEMENT_MODULES.map((m) =>
    deriveModuleState(rows, m),
  );

  return { states, rows, loading, busyModule, refetch: fetchRows, setModule };
}
