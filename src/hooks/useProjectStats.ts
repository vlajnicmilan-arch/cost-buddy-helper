import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ProjectExpense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
}

interface ProjectStats {
  totalSpent: number;
  totalIncome: number;
  balance: number;
  transactionCount: number;
  budgetUsedPercentage: number;
  expensesByCategory: Record<string, number>;
  expensesByMilestone: Record<string, number>;
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
      const { data, error } = await supabase
        .from('expenses')
        .select('id, user_id, amount, description, category, date, type, milestone_id, status')
        .eq('project_id', projectId)
        .eq('status', 'approved')
        .order('date', { ascending: false });

      if (error) throw error;

      setExpenses((data || []).map(e => ({
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
    const expenseTransactions = expenses.filter(e => e.type === 'expense');
    const incomeTransactions = expenses.filter(e => e.type === 'income');

    const totalSpent = expenseTransactions.reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = incomeTransactions.reduce((sum, e) => sum + e.amount, 0);
    const balance = totalIncome - totalSpent;

    // Budget used percentage
    const budgetUsedPercentage = totalBudget > 0 
      ? Math.min((totalSpent / totalBudget) * 100, 100) 
      : 0;

    // Expenses by category
    const expensesByCategory: Record<string, number> = {};
    expenseTransactions.forEach(e => {
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount;
    });

    // Expenses by milestone
    const expensesByMilestone: Record<string, number> = {};
    expenseTransactions.forEach(e => {
      if (e.milestone_id) {
        expensesByMilestone[e.milestone_id] = (expensesByMilestone[e.milestone_id] || 0) + e.amount;
      }
    });

    return {
      totalSpent,
      totalIncome,
      balance,
      transactionCount: expenses.length,
      budgetUsedPercentage,
      expensesByCategory,
      expensesByMilestone
    };
  }, [expenses, totalBudget]);

  return {
    expenses,
    stats,
    loading,
    refetch: fetchExpenses
  };
};
