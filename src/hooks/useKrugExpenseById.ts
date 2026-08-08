/**
 * useKrugExpenseById — dohvat jednog troška za deep-link iz obavijesti.
 *
 * Vidljivost ide isključivo kroz RLS. Ako red ne postoji (obrisan trošak,
 * izgubljen pristup), vraća `null` — pozivatelj tada ostaje na ekranu Kruga
 * bez greške.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Expense } from '@/types/expense';

export function useKrugExpenseById(expenseId: string | null | undefined) {
  return useQuery({
    queryKey: ['krug', 'expense-by-id', expenseId],
    enabled: !!expenseId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Expense | null> => {
      if (!expenseId) return null;
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', expenseId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { ...(data as any), date: new Date((data as any).date) } as Expense;
    },
  });
}
