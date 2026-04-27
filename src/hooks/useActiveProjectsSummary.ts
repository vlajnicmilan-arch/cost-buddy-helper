import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  calculateProjectSpent,
  calculateProjectIncomeFromTransactions,
  RawProjectExpense,
} from '@/lib/projectCalculations';

export interface ProjectSummaryEntry {
  spent: number;
  income: number;
  txCount: number;
}

/**
 * Fetches accurate spent/income totals for a small list of projects
 * (e.g. the active-projects strip on the Home screen).
 *
 * Why this exists: useExpenses() paginates the dashboard list, so summing
 * `allExpenses.filter(e => e.project_id === id)` gives stale/partial numbers.
 * This hook does ONE focused query (with internal paging) per project-id set,
 * matching the same calculation rules used on the Projects page.
 */
export const useActiveProjectsSummary = (projectIds: string[]) => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Map<string, ProjectSummaryEntry>>(new Map());
  const [loading, setLoading] = useState(false);

  // Stable cache key: sorted ids
  const idsKey = useMemo(
    () => [...projectIds].sort().join(','),
    [projectIds]
  );

  const fetchSummary = useCallback(async () => {
    if (!user || projectIds.length === 0) {
      setSummary(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const ids = idsKey.split(',').filter(Boolean);
      let allRows: any[] = [];
      let from = 0;
      const pageSize = 1000;

      // Page through all approved expenses for this set of projects
      while (true) {
        const { data, error } = await (supabase
          .from('expenses')
          .select('project_id, amount, type, status, expense_nature') as any)
          .in('project_id', ids)
          .eq('status', 'approved')
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // Group by project_id
      const byProject = new Map<string, RawProjectExpense[]>();
      for (const row of allRows) {
        const list = byProject.get(row.project_id) || [];
        list.push({
          amount: row.amount,
          type: row.type,
          status: row.status,
          expense_nature: row.expense_nature,
        });
        byProject.set(row.project_id, list);
      }

      // Compute per project
      const next = new Map<string, ProjectSummaryEntry>();
      for (const id of ids) {
        const rows = byProject.get(id) || [];
        next.set(id, {
          spent: calculateProjectSpent(rows),
          income: calculateProjectIncomeFromTransactions(rows),
          txCount: rows.length,
        });
      }
      setSummary(next);
    } catch (err) {
      console.error('Error fetching active projects summary:', err);
      setSummary(new Map());
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, idsKey]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, refetch: fetchSummary };
};
