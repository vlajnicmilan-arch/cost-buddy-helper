import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  calculateProjectSpent,
  calculateProjectIncomeFromTransactions,
  calculateNetExpenseAmount,
  isCountedProjectTransaction,
  type RawProjectExpense,
} from '@/lib/projectCalculations';

interface ProjectExpense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
  status?: string | null;
  submitted_by?: string | null;
  expense_nature?: string | null;
  payment_source?: string | null;
  is_advance?: boolean | null;
  collaborator_id?: string | null;
  linked_advance_ids?: string[] | null;
}

interface ProjectStats {
  totalSpent: number;
  totalIncome: number;
  balance: number;
  transactionCount: number;
  budgetUsedPercentage: number;
  expensesByCategory: Record<string, number>;
  expensesByMilestone: Record<string, number>;
  // Legacy expense-based totals (for backward compatibility)
  totalExpenseTransactions: number;
  totalIncomeTransactions: number;
}

export const useProjectStats = (projectId: string | null, totalBudget: number) => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = useCallback(async () => {
    if (!projectId || !user) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await (supabase
          .from('expenses')
          .select('id, user_id, amount, description, category, date, type, milestone_id, status, submitted_by, expense_nature, payment_source, is_advance, collaborator_id, linked_advance_ids') as any)
          .eq('project_id', projectId)
          .eq('status', 'approved')
          .order('date', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      setExpenses(allData.map(e => ({
        ...e,
        amount: Number(e.amount)
      })));
    } catch (error) {
      console.error('Error fetching project expenses:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const stats: ProjectStats = useMemo(() => {
    // F1 — use unified helpers (filters: approved, no transfer, no correction, advance-netting).
    const raw: RawProjectExpense[] = expenses as unknown as RawProjectExpense[];
    const totalSpent = calculateProjectSpent(raw);
    const totalIncome = calculateProjectIncomeFromTransactions(raw);
    const balance = totalIncome - totalSpent;

    const budgetUsedPercentage = totalBudget > 0
      ? Math.min((totalSpent / totalBudget) * 100, 100)
      : 0;

    // Per-category / per-milestone breakdowns use the SAME exclusion rules
    // (no transfer / correction / pending) and net advance amounts.
    const expensesByCategory: Record<string, number> = {};
    const expensesByMilestone: Record<string, number> = {};
    expenses.forEach(e => {
      const row = e as unknown as RawProjectExpense;
      if (!isCountedProjectTransaction(row) || row.type !== 'expense') return;
      const netAmount = calculateNetExpenseAmount(row, raw);
      if (netAmount <= 0) return;
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + netAmount;
      if (e.milestone_id) {
        expensesByMilestone[e.milestone_id] = (expensesByMilestone[e.milestone_id] || 0) + netAmount;
      }
    });

    return {
      totalSpent,
      totalIncome,
      balance,
      transactionCount: expenses.length,
      budgetUsedPercentage,
      expensesByCategory,
      expensesByMilestone,
      totalExpenseTransactions: totalSpent,
      totalIncomeTransactions: totalIncome,
    };
  }, [expenses, totalBudget]);

  return {
    expenses,
    stats,
    loading,
    refetch: fetchExpenses
  };
};
