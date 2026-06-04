import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GrantModule } from './useMyActiveModuleGrants';

export type GrantReasonCode =
  | 'refund'
  | 'beta_tester'
  | 'internal'
  | 'partner'
  | 'support'
  | 'other';

export type RevokeActor = 'admin' | 'system';

export interface AdminGrantRow {
  id: string;
  user_id: string;
  module: GrantModule;
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
  reason_code: GrantReasonCode;
  reason_note: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_actor: RevokeActor | null;
  revoke_reason: string | null;
}

export type DerivedStatus = 'revoked' | 'expired' | 'active';

/**
 * Determinističko izvođenje statusa s točnim prioritetom:
 *   1) revoked  (revoked_at != null)
 *   2) expired  (expires_at != null && expires_at <= now())
 *   3) active   (inače)
 */
export function deriveGrantStatus(
  row: Pick<AdminGrantRow, 'revoked_at' | 'expires_at'>,
  now: Date = new Date()
): DerivedStatus {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'active';
}

export interface GrantResultItem {
  module: GrantModule;
  status: 'granted' | 'conflict_active';
  grant_id?: string;
  existing?: {
    id: string;
    module: GrantModule;
    granted_at: string;
    expires_at: string | null;
    is_permanent: boolean;
    reason_code: GrantReasonCode;
  };
}

export interface GrantResponse {
  results: GrantResultItem[];
}

/**
 * Admin-side: lista history svih grantova za target usera + grant/revoke akcije.
 */
export function useAdminModuleGrants(targetUserId: string | null | undefined) {
  const [rows, setRows] = useState<AdminGrantRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!targetUserId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_module_grants')
      .select('*')
      .eq('user_id', targetUserId)
      .order('granted_at', { ascending: false });
    if (error) {
      console.warn('[useAdminModuleGrants] fetch error:', error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as AdminGrantRow[]);
    }
    setLoading(false);
  }, [targetUserId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const grant = useCallback(
    async (params: {
      modules: GrantModule[];
      expires_at: string | null;
      reason_code: GrantReasonCode;
      reason_note: string;
    }): Promise<GrantResponse> => {
      if (!targetUserId) throw new Error('no_target_user');
      const { data, error } = await supabase.rpc('grant_module_access', {
        p_user_id: targetUserId,
        p_modules: params.modules,
        p_expires_at: params.expires_at as unknown as string,
        p_reason_code: params.reason_code,
        p_reason_note: params.reason_note,
      });
      if (error) throw error;
      await fetchHistory();
      return data as unknown as GrantResponse;
    },
    [targetUserId, fetchHistory]
  );

  const revoke = useCallback(
    async (grantId: string, reason: string) => {
      const { error } = await supabase.rpc('revoke_module_access', {
        p_grant_id: grantId,
        p_revoke_reason: reason,
      });
      if (error) throw error;
      await fetchHistory();
    },
    [fetchHistory]
  );

  return { rows, loading, refetch: fetchHistory, grant, revoke };
}
