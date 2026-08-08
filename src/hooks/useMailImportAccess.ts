import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * MAIL UVOZ — pravo `mail_uvoz` iz postojećeg sustava prava (user_entitlements).
 * Nije dio 4 osnovna modula pa se čita izravno (RLS: korisnik vidi svoje redove).
 */
export function useMailImportAccess() {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    if (!user?.id) {
      setHasAccess(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_entitlements')
      .select('id, period_end')
      .eq('user_id', user.id)
      .eq('module', 'mail_uvoz')
      .eq('status', 'active');
    if (error) {
      console.warn('[useMailImportAccess] fetch error:', error.message);
      setHasAccess(false);
    } else {
      setHasAccess(
        (data ?? []).some((r) => !r.period_end || r.period_end > nowIso)
      );
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    check();
  }, [check]);

  return { hasAccess, loading, refetch: check };
}
