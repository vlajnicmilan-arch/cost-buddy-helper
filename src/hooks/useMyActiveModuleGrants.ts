import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type GrantModule = 'projects' | 'business';

export interface ActiveModuleGrant {
  id: string;
  module: GrantModule;
  granted_at: string;
  expires_at: string | null;
}

/**
 * User-side: vraća MOJE aktivne admin override grantove (Projects/Business).
 * Aktivan = revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()).
 * Koristi se za:
 *  - aditivni merge u useFeatureAccess (Projects)
 *  - read-only badge u ModulesSection
 */
export function useMyActiveModuleGrants() {
  const { user } = useAuth();
  const [grants, setGrants] = useState<ActiveModuleGrant[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGrants = useCallback(async () => {
    if (!user?.id) {
      setGrants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('admin_module_grants')
      .select('id, module, granted_at, expires_at, revoked_at')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

    if (error) {
      console.warn('[useMyActiveModuleGrants] fetch error:', error.message);
      setGrants([]);
    } else {
      setGrants(
        (data ?? []).map((r) => ({
          id: r.id,
          module: r.module as GrantModule,
          granted_at: r.granted_at,
          expires_at: r.expires_at,
        }))
      );
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  const hasActiveGrant = useCallback(
    (module: GrantModule) => grants.some((g) => g.module === module),
    [grants]
  );

  const getGrant = useCallback(
    (module: GrantModule): ActiveModuleGrant | undefined =>
      grants.find((g) => g.module === module),
    [grants]
  );

  return { grants, loading, hasActiveGrant, getGrant, refetch: fetchGrants };
}
