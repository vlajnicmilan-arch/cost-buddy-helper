import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * MAIL UVOZ — broj dokumenata koji čekaju pregled.
 *
 * Jeftin `head: true` count; koristi ga kartica na početnom ekranu i broj u
 * tabu ekrana Dokumenti. Nikad ne dohvaća sadržaj stavki.
 */
export function useMailPendingCount(enabled: boolean) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!enabled || !user?.id) {
      setCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { count: rows, error } = await supabase
      .from('document_ingest_items')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', user.id)
      .eq('status', 'na_pregledu');

    if (error) {
      console.warn('[useMailPendingCount] fetch error:', error.message);
      setCount(0);
    } else {
      setCount(rows ?? 0);
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  return { count, loading, refetch: fetchCount };
}
