import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Expense } from '@/types/expense';

/**
 * Vraća group_id family grupe kojoj pripada payment_source transakcije
 * (preko family_shared_sources), ili null ako transakcija nije na shared izvoru.
 *
 * Logika izvlačenja UUID-a:
 * - 'custom:<uuid>'   → uuid
 * - direktni UUID koji match-a customPaymentSources[].id → koristimo direktno
 * - sve ostalo (cash, generic) → null
 */
export function useFamilyGroupForExpense(expense: Expense | null | undefined) {
  const sourceId = extractCustomSourceId(expense?.payment_source);

  const query = useQuery({
    queryKey: ['family-group-for-source', sourceId],
    enabled: !!sourceId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!sourceId) return null;
      const { data, error } = await supabase
        .from('family_shared_sources')
        .select('group_id')
        .eq('payment_source_id', sourceId)
        .maybeSingle();
      if (error) {
        console.error('[useFamilyGroupForExpense]', error);
        return null;
      }
      return (data?.group_id as string | undefined) ?? null;
    },
  });

  return {
    groupId: query.data ?? null,
    loading: query.isLoading,
  };
}

function extractCustomSourceId(payment_source: string | null | undefined): string | null {
  if (!payment_source) return null;
  if (payment_source.startsWith('custom:')) {
    const id = payment_source.slice('custom:'.length);
    return isUuid(id) ? id : null;
  }
  return isUuid(payment_source) ? payment_source : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
