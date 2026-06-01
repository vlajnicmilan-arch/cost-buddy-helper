import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MemberTally {
  user_id: string;
  display_name: string;
  amount: number;
}

export type BudgetTallyMap = Record<string, MemberTally[]>;

/**
 * Per-member spend tally on shared budgets.
 * Returns map of budget_id -> sorted MemberTally[] (descending by amount).
 * Bez DB promjena, koristi postojeću RLS na expenses.
 */
export const useFamilyBudgetTally = (
  budgetIds: string[],
  members: { user_id: string; display_name?: string }[]
) => {
  const [tallies, setTallies] = useState<BudgetTallyMap>({});
  const [loading, setLoading] = useState(false);

  // Stable signatures to avoid refetch loops.
  const budgetKey = budgetIds.slice().sort().join(',');
  const memberKey = members.map((m) => m.user_id).sort().join(',');

  useEffect(() => {
    let cancelled = false;

    const fetchTallies = async () => {
      if (!budgetIds.length || !members.length) {
        setTallies({});
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select('budget_id, user_id, amount, type')
          .in('budget_id', budgetIds)
          .in('user_id', members.map((m) => m.user_id))
          .eq('type', 'expense');

        if (error) throw error;
        if (cancelled) return;

        const nameMap = new Map(members.map((m) => [m.user_id, m.display_name || '?']));
        const acc: Record<string, Record<string, number>> = {};

        (data || []).forEach((row: any) => {
          if (!row.budget_id) return;
          const bId = row.budget_id as string;
          const uId = row.user_id as string;
          if (!acc[bId]) acc[bId] = {};
          acc[bId][uId] = (acc[bId][uId] || 0) + Number(row.amount || 0);
        });

        const result: BudgetTallyMap = {};
        Object.entries(acc).forEach(([bId, perUser]) => {
          result[bId] = Object.entries(perUser)
            .map(([uId, amount]) => ({
              user_id: uId,
              display_name: nameMap.get(uId) || '?',
              amount,
            }))
            .sort((a, b) => b.amount - a.amount);
        });

        setTallies(result);
      } catch (err) {
        console.error('Error fetching family budget tally:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTallies();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetKey, memberKey]);

  return { tallies, loading };
};
