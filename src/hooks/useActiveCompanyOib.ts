/**
 * useActiveCompanyOib — OIB trenutno aktivne tvrtke.
 *
 * Smjer eRačuna (ulazni / izlazni) određuje se usporedbom OIB-a tvrtke s
 * OIB-om dobavljača i kupca iz XML-a, pa je ovo jedini podatak koji uvoz
 * treba iz `business_profiles`.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';

export const useActiveCompanyOib = () => {
  const { user, authReady } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [oib, setOib] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!authReady) return;
    if (!user || !activeBusinessProfileId) {
      setOib(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('business_profiles')
      .select('oib')
      .eq('id', activeBusinessProfileId)
      .maybeSingle();
    if (error) {
      console.error('[useActiveCompanyOib] fetch failed', error);
      setOib(null);
    } else {
      setOib((data as { oib: string | null } | null)?.oib ?? null);
    }
    setLoading(false);
  }, [user, authReady, activeBusinessProfileId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { companyOib: oib, loading };
};
