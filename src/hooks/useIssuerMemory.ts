import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * „MOJI IZDAVATELJI" — pravila kojima korisnik upravlja.
 *
 * Pamćenje nastaje ISKLJUČIVO iz vidljive korisnikove potvrde (kvačica u redu
 * pregleda). Ovaj hook daje popis tih pravila i mogućnost zaborava. RLS na
 * `mail_issuer_memory` već ograničava redke na vlasnika.
 */

export interface IssuerMemoryEntry {
  id: string;
  supplier_oib: string;
  supplier_name: string | null;
  place_label: string | null;
  place_code: string;
  confirmed_count: number;
  last_seen_at: string;
  known_ibans: string[];
}

export function useIssuerMemory(enabled: boolean) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<IssuerMemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!enabled || !user?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('mail_issuer_memory')
      .select('id, supplier_oib, supplier_name, place_label, place_code, confirmed_count, last_seen_at, known_ibans')
      .eq('user_id', user.id)
      .order('confirmed_count', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('[useIssuerMemory] fetch error:', error.message);
      setEntries([]);
    } else {
      setEntries(
        (data ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          supplier_oib: String(row.supplier_oib ?? ''),
          supplier_name: (row.supplier_name as string | null) ?? null,
          place_label: (row.place_label as string | null) ?? null,
          place_code: String(row.place_code ?? ''),
          confirmed_count: Number(row.confirmed_count ?? 0),
          last_seen_at: String(row.last_seen_at ?? ''),
          known_ibans: Array.isArray(row.known_ibans) ? (row.known_ibans as string[]) : [],
        })),
      );
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const forgetEntry = useCallback(
    async (id: string) => {
      setWorking(true);
      try {
        const { error } = await supabase.from('mail_issuer_memory').delete().eq('id', id);
        if (error) {
          console.warn('[useIssuerMemory] delete error:', error.message);
          return false;
        }
        await fetchEntries();
        return true;
      } finally {
        setWorking(false);
      }
    },
    [fetchEntries],
  );

  return { entries, loading, working, forgetEntry, refetch: fetchEntries };
}
