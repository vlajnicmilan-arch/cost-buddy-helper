import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMailPendingEvent } from '@/hooks/useMailRealtime';
import { useAppResume } from '@/hooks/useAppResume';


/**
 * MAIL UVOZ — broj dokumenata koji čekaju pregled.
 *
 * Jeftin `head: true` count; koristi ga kartica na početnom ekranu i broj u
 * tabu ekrana Dokumenti. Nikad ne dohvaća sadržaj stavki.
 *
 * Svježina: uz živi kanal, brojač se tiho osvježi i na povratak u fokus /
 * mrežu (`useAppResume`) — dugo otvoren tab ne smije pokazivati jučerašnji broj.
 */
export function useMailPendingCount(enabled: boolean) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  /** Prvi dohvat smije pokazati loading; kasniji su tihi (bez treptanja). */
  const hydratedRef = useRef(false);

  const fetchCount = useCallback(async () => {
    if (!enabled || !user?.id) {
      setCount(0);
      setLoading(false);
      return;
    }
    if (!hydratedRef.current) setLoading(true);
    const { count: rows, error } = await supabase
      .from('document_ingest_items')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', user.id)
      .eq('status', 'na_pregledu');

    if (error) {
      console.warn('[useMailPendingCount] fetch error:', error.message);
      // Fail-safe: zadrži zadnju poznatu vrijednost ako je već bila učitana.
      if (!hydratedRef.current) setCount(0);
    } else {
      setCount(rows ?? 0);
      hydratedRef.current = true;
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Živi kanal: nova stavka „na pregledu" osvježi brojač bez izlaska iz appa.
  useMailPendingEvent(fetchCount);

  // Povratak u fokus / mrežu: tiho osvježenje (debounce u useAppResume).
  useAppResume(fetchCount, { enabled });


  return { count, loading, refetch: fetchCount };
}
