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
      const [
        projectRes,
        transactionsRes,
        workEntriesRes,
        workersRes,
        collaboratorsRes,
        rateHistoryRes,
      ] = await Promise.all([
        (supabase.from('projects') as any)
          .select('contract_value, total_budget')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('expenses')
          .select('id, type, amount, status, expense_nature, is_advance, linked_advance_ids')
          .eq('project_id', projectId),
        supabase
          .from('project_work_entries')
          .select('actual_hours, worker_id, work_date')
          .eq('project_id', projectId),
        supabase
          .from('project_workers')
          .select('id, first_name, last_name, hourly_rate')
          .eq('project_id', projectId),
        (supabase.from('project_collaborators') as any)
          .select('id, first_name, last_name, total_price, paid_amount')
          .eq('project_id', projectId),
        // Rate history for all workers on this project — used by computeProjectLaborCost
        // to apply historical rates (rate_at) per work_date. RLS: policy
        // `rate_history_select_owner_or_own_worker` filters to owner/own worker.
        (supabase.from('project_worker_rate_history') as any)
          .select('worker_id, rate, effective_from, project_workers!inner(project_id)')
          .eq('project_workers.project_id', projectId),
      ]);

      const workers = (workersRes.data as any[]) ?? [];
      const rateHistory = ((rateHistoryRes?.data as any[]) ?? []).map((r: any) => ({
        worker_id: r.worker_id,
        rate: r.rate,
        effective_from: r.effective_from,
      }));

      const pl = computeProjectProfitLoss({
        project: projectRes?.data ?? null,
        transactions: (transactionsRes.data as any[]) ?? [],
        workEntries: (workEntriesRes.data as any[]) ?? [],
        workers,
        collaborators: (collaboratorsRes.data as any[]) ?? [],
        rateHistory,
      });

      // Diagnostic: warn once per fetch when a worker with entries has no
      // rate_history row and we had to fall back to worker.hourly_rate.
      // Missing history typically means the V1-B backfill didn't run for that
      // worker (edge case). P&L is still finite; owner should re-set rate.
      if (rateHistory.length === 0 && (workEntriesRes.data as any[])?.length) {
        // No history at all for the project — expected on fresh install; no warn.
      }
      // We surface missingHistoryWorkerIds via the labor helper indirectly;
      // to avoid double-computing, do a lightweight warn only when history
      // exists but some worker still has none.
      if (rateHistory.length > 0) {
        const workersWithHistory = new Set(rateHistory.map((r) => r.worker_id));
        const missing = workers
          .filter((w: any) => !workersWithHistory.has(w.id))
          .map((w: any) => w.id);
        if (missing.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            '[useProjectProfitLoss] workers without rate_history — falling back to worker.hourly_rate',
            { projectId, workerIds: missing },
          );
        }
      }

      setResult(pl);
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
