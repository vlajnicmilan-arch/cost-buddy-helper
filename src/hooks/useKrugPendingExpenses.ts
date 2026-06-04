/**
 * useKrugPendingExpenses — lista shared transakcija u stanju `predlozena`.
 *
 * Vidljivost ide ISKLJUČIVO kroz RLS na `expenses`. Klijent ne uvodi nikakav
 * dodatni visibility filter — što baza vrati, to korisnik smije vidjeti.
 *
 * Ne dovlači predloške koji su soft-deletani (`deleted_at IS NULL`).
 * Limit 50 — queue je akcijski, nije arhivski view.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Expense } from '@/types/expense';

const STALE = 60 * 1000;
const LIMIT = 50;

export function useKrugPendingExpenses(krugId: string | null | undefined) {
  return useQuery({
    queryKey: ['krug', 'pending-expenses', krugId],
    enabled: !!krugId,
    staleTime: STALE,
    queryFn: async (): Promise<Expense[]> => {
      if (!krugId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('krug_id', krugId)
        .eq('krug_privacy', 'shared')
        .eq('krug_shared_status', 'predlozena')
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        date: new Date(row.date),
      })) as Expense[];
    },
  });
}
