import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface BusinessProfileLite {
  id: string;
  name: string;
  /** OIB tvrtke — koristi ga usmjeravanje skena računa po OIB-u kupca. */
  oib: string | null;
}

/**
 * Lightweight list of the current user's business profiles (companies).
 * Used by wallet view-mode chips and the payment-source dialog so users
 * with multiple companies can filter / assign sources per company.
 */
export const useBusinessProfiles = () => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<BusinessProfileLite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    if (!user) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('id, company_name, oib')
        .eq('user_id', user.id)
        .order('company_name', { ascending: true });
      if (error) throw error;
      setProfiles(((data || []) as Array<{ id: string; company_name: string; oib: string | null }>).map(p => ({
        id: p.id,
        name: p.company_name,
        oib: p.oib ?? null,
      })));
    } catch (err) {
      console.error('[useBusinessProfiles] fetch failed', err);
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Listen for cross-component updates (e.g. profile created/renamed/deleted)
  useEffect(() => {
    const handler = () => fetchProfiles();
    window.addEventListener('business-profiles-changed', handler);
    return () => window.removeEventListener('business-profiles-changed', handler);
  }, [fetchProfiles]);

  return { profiles, loading, refetch: fetchProfiles };
};
