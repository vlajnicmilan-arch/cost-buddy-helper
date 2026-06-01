import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  computeProjectProfitLoss,
  type PLResult,
  type PLWorkerDetail,
  type PLCollaboratorDetail,
} from '@/lib/projectProfitLoss';

export type WorkerDetail = PLWorkerDetail;
export type CollaboratorDetail = PLCollaboratorDetail;

export interface ProfitLossData extends PLResult {
  loading: boolean;
}

const EMPTY: PLResult = {
  totalIncome: 0,
  totalExpenses: 0,
  laborCost: 0,
  collaboratorCost: 0,
  materialCost: 0,
  netProfit: 0,
  margin: 0,
  workers: [],
  collaborators: [],
  contractValue: 0,
  expectedProfit: 0,
  expectedMargin: 0,
  collectedPercentage: 0,
  remainingToCollect: 0,
};

export const useProjectProfitLoss = (projectId: string | null): ProfitLossData => {
  const { user } = useAuth();
  const [result, setResult] = useState<PLResult>(EMPTY);
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

      setResult(
        computeProjectProfitLoss({
          project: projectRes?.data ?? null,
          transactions: (transactionsRes.data as any[]) ?? [],
          workEntries: (workEntriesRes.data as any[]) ?? [],
          workers: (workersRes.data as any[]) ?? [],
          collaborators: (collaboratorsRes.data as any[]) ?? [],
        })
      );
    } catch (error) {
      console.error('Error fetching P&L data:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...result, loading };
};
