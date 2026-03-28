import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ProfitLossData {
  totalIncome: number;
  totalExpenses: number;
  laborCost: number;
  collaboratorCost: number;
  materialCost: number;
  netProfit: number;
  margin: number;
  loading: boolean;
}

export const useProjectProfitLoss = (projectId: string | null): ProfitLossData => {
  const { user } = useAuth();
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [laborCost, setLaborCost] = useState(0);
  const [collaboratorCost, setCollaboratorCost] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!projectId || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch all project transactions, worker entries, and collaborators in parallel
      const [transactionsRes, workEntriesRes, workersRes, collaboratorsRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('type, amount')
          .eq('project_id', projectId),
        supabase
          .from('project_work_entries')
          .select('actual_hours, worker_id')
          .eq('project_id', projectId),
        supabase
          .from('project_workers')
          .select('id, hourly_rate')
          .eq('project_id', projectId),
        (supabase.from('project_collaborators') as any)
          .select('paid_amount')
          .eq('project_id', projectId),
      ]);

      // Calculate income and expenses from transactions
      let totalIncome = 0;
      let totalExpense = 0;
      transactionsRes.data?.forEach((t: any) => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') totalIncome += amt;
        else if (t.type === 'expense') totalExpense += amt;
      });

      // Calculate labor costs from work entries
      const rateMap = new Map<string, number>();
      workersRes.data?.forEach((w: any) => {
        rateMap.set(w.id, Number(w.hourly_rate) || 0);
      });

      let totalLabor = 0;
      workEntriesRes.data?.forEach((e: any) => {
        const rate = rateMap.get(e.worker_id) || 0;
        totalLabor += (Number(e.actual_hours) || 0) * rate;
      });

      // Calculate collaborator costs
      let totalCollab = 0;
      collaboratorsRes.data?.forEach((c: any) => {
        totalCollab += Number(c.paid_amount) || 0;
      });

      setIncome(totalIncome);
      setExpenses(totalExpense);
      setLaborCost(totalLabor);
      setCollaboratorCost(totalCollab);
    } catch (error) {
      console.error('Error fetching P&L data:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const materialCost = Math.max(0, expenses - laborCost - collaboratorCost);
  const totalCosts = laborCost + collaboratorCost + materialCost;
  const netProfit = income - totalCosts;
  const margin = income > 0 ? (netProfit / income) * 100 : 0;

  return {
    totalIncome: income,
    totalExpenses: expenses,
    laborCost,
    collaboratorCost,
    materialCost,
    netProfit,
    margin,
    loading,
  };
};
