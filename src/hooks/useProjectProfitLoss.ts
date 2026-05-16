import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface WorkerDetail {
  id: string;
  name: string;
  hours: number;
  rate: number;
  cost: number;
}

export interface CollaboratorDetail {
  id: string;
  name: string;
  totalPrice: number;
  paidAmount: number;
}

export interface ProfitLossData {
  totalIncome: number;
  totalExpenses: number;
  laborCost: number;
  collaboratorCost: number;
  materialCost: number;
  netProfit: number;
  margin: number;
  loading: boolean;
  workers: WorkerDetail[];
  collaborators: CollaboratorDetail[];
  // ── Accrual / Contract-based (dual view) ──
  contractValue: number;
  expectedProfit: number;
  expectedMargin: number;
  collectedPercentage: number;
  remainingToCollect: number;
}

export const useProjectProfitLoss = (projectId: string | null): ProfitLossData => {
  const { user } = useAuth();
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [laborCost, setLaborCost] = useState(0);
  const [collaboratorCost, setCollaboratorCost] = useState(0);
  const [workers, setWorkers] = useState<WorkerDetail[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorDetail[]>([]);
  const [contractValue, setContractValue] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!projectId || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [projectRes, transactionsRes, workEntriesRes, workersRes, collaboratorsRes] = await Promise.all([
        (supabase.from('projects') as any)
          .select('contract_value, total_budget')
          .eq('id', projectId)
          .maybeSingle(),
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
          .select('id, first_name, last_name, hourly_rate')
          .eq('project_id', projectId),
        (supabase.from('project_collaborators') as any)
          .select('id, first_name, last_name, total_price, paid_amount')
          .eq('project_id', projectId),
      ]);

      // Resolve contract value with fallback to total_budget
      const proj = projectRes?.data;
      const cv = Number(proj?.contract_value || 0);
      const resolvedContract = cv > 0 ? cv : Number(proj?.total_budget || 0);
      setContractValue(resolvedContract);

      // Calculate income and expenses from transactions
      let totalIncome = 0;
      let totalExpense = 0;
      transactionsRes.data?.forEach((t: any) => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') totalIncome += amt;
        else if (t.type === 'expense') totalExpense += amt;
      });

      // Build worker rate/name map and calculate labor costs
      const workerMap = new Map<string, { name: string; rate: number; hours: number }>();
      workersRes.data?.forEach((w: any) => {
        workerMap.set(w.id, {
          name: `${w.first_name} ${w.last_name}`,
          rate: Number(w.hourly_rate) || 0,
          hours: 0,
        });
      });

      workEntriesRes.data?.forEach((e: any) => {
        const worker = workerMap.get(e.worker_id);
        if (worker) {
          worker.hours += Number(e.actual_hours) || 0;
        }
      });

      let totalLabor = 0;
      const workerDetails: WorkerDetail[] = [];
      workerMap.forEach((w, id) => {
        const cost = w.hours * w.rate;
        totalLabor += cost;
        if (w.hours > 0) {
          workerDetails.push({ id, name: w.name, hours: w.hours, rate: w.rate, cost });
        }
      });

      // Calculate collaborator costs
      let totalCollab = 0;
      const collabDetails: CollaboratorDetail[] = [];
      collaboratorsRes.data?.forEach((c: any) => {
        const paid = Number(c.paid_amount) || 0;
        totalCollab += paid;
        collabDetails.push({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
          totalPrice: Number(c.total_price) || 0,
          paidAmount: paid,
        });
      });

      setIncome(totalIncome);
      setExpenses(totalExpense);
      setLaborCost(totalLabor);
      setCollaboratorCost(totalCollab);
      setWorkers(workerDetails);
      setCollaborators(collabDetails);
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

  // Accrual / contract view
  const expectedProfit = contractValue - totalCosts;
  const expectedMargin = contractValue > 0 ? (expectedProfit / contractValue) * 100 : 0;
  const collectedPercentage = contractValue > 0 ? Math.min((income / contractValue) * 100, 100) : 0;
  const remainingToCollect = Math.max(contractValue - income, 0);

  return {
    totalIncome: income,
    totalExpenses: expenses,
    laborCost,
    collaboratorCost,
    materialCost,
    netProfit,
    margin,
    loading,
    workers,
    collaborators,
    contractValue,
    expectedProfit,
    expectedMargin,
    collectedPercentage,
    remainingToCollect,
  };
};
