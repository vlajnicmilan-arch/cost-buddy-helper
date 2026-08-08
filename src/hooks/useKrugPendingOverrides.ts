/**
 * useKrugPendingOverrides — pending prijedlozi ručne podjele (override) u Krugu.
 *
 * Red "Za odlučivanje" ih lista kao link-stavke: klik otvara PREGLED te
 * transakcije, gdje `KrugExpenseSplitPanelGate` nosi svu akcijsku logiku.
 * Ovdje se NE duplicira nijedna akcija.
 *
 * Vidljivost ide kroz RLS (override tablica + expenses). Klijent ne dodaje
 * dodatni visibility filter.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KRUG_SYNC_QUERY_OPTIONS } from '@/hooks/useKrugQueryOptions';
import { Expense } from '@/types/expense';

const STALE = 60 * 1000;
const LIMIT = 50;

export interface PendingOverrideItem {
  overrideId: string;
  proposedBy: string;
  createdAt: string;
  expense: Expense;
}

export function useKrugPendingOverrides(krugId: string | null | undefined) {
  return useQuery({
    queryKey: ['krug', 'pending-overrides', krugId],
    enabled: !!krugId,
    staleTime: STALE,
    ...KRUG_SYNC_QUERY_OPTIONS,
    queryFn: async (): Promise<PendingOverrideItem[]> => {
      if (!krugId) return [];
      const { data: overrides, error } = await supabase
        .from('krug_expense_split_override' as any)
        .select('id, expense_id, proposed_by, created_at')
        .eq('krug_id', krugId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      const rows = (overrides ?? []) as any[];
      if (rows.length === 0) return [];

      const { data: expenses, error: expErr } = await supabase
        .from('expenses')
        .select('*')
        .in('id', rows.map((r) => r.expense_id))
        .is('deleted_at', null);
      if (expErr) throw expErr;

      const byId = new Map<string, any>((expenses ?? []).map((e: any) => [e.id, e]));
      return rows
        .filter((r) => byId.has(r.expense_id))
        .map((r) => ({
          overrideId: r.id as string,
          proposedBy: r.proposed_by as string,
          createdAt: r.created_at as string,
          expense: { ...byId.get(r.expense_id), date: new Date(byId.get(r.expense_id).date) } as Expense,
        }));
    },
  });
}
