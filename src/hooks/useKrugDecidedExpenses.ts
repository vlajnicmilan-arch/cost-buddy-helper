/**
 * useKrugDecidedExpenses — recent shared expenses that already have an outcome.
 *
 * Read-only trag odluka za `KrugDetailScreen > Odlučeno` sekciju.
 *
 * Filter (strogo, ne mijenjati bez tests):
 *   - krug_id = ovaj Krug
 *   - krug_privacy = 'shared'
 *   - krug_shared_status IN ('potvrdjena','nepotvrdjena')
 *   - deleted_at IS NULL
 *
 * Vidljivost = RLS na expenses. Klijent NE dodaje visibility filter.
 * Ne sortiramo po `date` (datum troška) nego po `updated_at` — semantika je
 * "kad je odlučeno", ne "kad se dogodilo".
 *
 * Ovo NIJE approval queue. Nema akcija. Ograničeno na zadnjih N.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KRUG_SYNC_QUERY_OPTIONS } from '@/hooks/useKrugQueryOptions';
import { Expense } from '@/types/expense';

const STALE = 60 * 1000;
export const KRUG_DECIDED_LIMIT = 10;

export function useKrugDecidedExpenses(krugId: string | null | undefined) {
  return useQuery({
    queryKey: ['krug', 'decided-expenses', krugId],
    enabled: !!krugId,
    staleTime: STALE,
    ...KRUG_SYNC_QUERY_OPTIONS,
    queryFn: async (): Promise<Expense[]> => {
      if (!krugId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('krug_id', krugId)
        .eq('krug_privacy', 'shared')
        .in('krug_shared_status', ['potvrdjena', 'nepotvrdjena'])
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(KRUG_DECIDED_LIMIT);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        date: new Date(row.date),
      })) as Expense[];
    },
  });
}
