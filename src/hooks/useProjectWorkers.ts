import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProjectWorker, ProjectWorkerInput } from '@/types/projectWorker';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import {
  computeWorkerCostTotals,
  type RateHistoryRow,
  type WorkEntryForCost,
} from '@/lib/workerRateHistory';

interface WorkEntryLite extends WorkEntryForCost {}

interface WorkerWithStats extends ProjectWorker {
  actualHoursTotal: number;
  actualCostTotal: number;
  currentMonthHours: number;
  currentMonthCost: number;
  remainingHours: number;
  remainingCost: number;
}

export interface SetWorkerRateResult {
  success: boolean;
  /** payout_id blocking the change (collision) */
  collisionPayoutId?: string;
  /** earliest allowed effective_from date (YYYY-MM-DD) */
  earliestAllowedDate?: string;
  error?: string;
}

export const useProjectWorkers = (projectId: string | null) => {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<WorkerWithStats[]>([]);
  const [entries, setEntries] = useState<WorkEntryLite[]>([]);
  const [rateHistory, setRateHistory] = useState<RateHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkers = useCallback(async () => {
    if (!projectId) {
      setWorkers([]);
      setEntries([]);
      setRateHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [workersRes, entriesRes] = await Promise.all([
        supabase
          .from('project_workers')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_work_entries')
          .select('worker_id, actual_hours, work_date, payout_id')
          .eq('project_id', projectId),
      ]);

      if (workersRes.error) throw workersRes.error;

      const workerIds = (workersRes.data || []).map((w: any) => w.id as string);
      let history: RateHistoryRow[] = [];
      if (workerIds.length > 0) {
        const { data: histData, error: histErr } = await supabase
          .from('project_worker_rate_history' as any)
          .select('worker_id, rate, effective_from')
          .in('worker_id', workerIds);
        if (histErr) {
          console.warn('rate history fetch failed:', histErr);
        } else {
          history = ((histData ?? []) as any[]).map((r) => ({
            worker_id: r.worker_id,
            rate: Number(r.rate),
            effective_from: r.effective_from,
          }));
        }
      }

      const rawEntries: WorkEntryLite[] = (entriesRes.data || []).map((e: any) => ({
        worker_id: e.worker_id,
        work_date: e.work_date,
        actual_hours: Number(e.actual_hours),
        payout_id: e.payout_id ?? null,
      }));

      const fallbackByWorker: Record<string, number> = {};
      for (const w of workersRes.data || []) {
        fallbackByWorker[(w as any).id] = Number((w as any).hourly_rate);
      }
      const totals = computeWorkerCostTotals(rawEntries, history, fallbackByWorker);

      const workersWithStats: WorkerWithStats[] = (workersRes.data || []).map((w: any) => {
        const t0 = totals[w.id];
        return {
          ...w,
          work_hours: Number(w.work_hours),
          hourly_rate: Number(w.hourly_rate),
          actualHoursTotal: t0?.totalHours ?? 0,
          actualCostTotal: t0?.totalCost ?? 0,
          currentMonthHours: t0?.currentMonthHours ?? 0,
          currentMonthCost: t0?.currentMonthCost ?? 0,
          remainingHours: t0?.remainingHours ?? 0,
          remainingCost: t0?.remainingCost ?? 0,
        };
      });

      setWorkers(workersWithStats);
      setEntries(rawEntries);
      setRateHistory(history);
    } catch (error) {
      console.error('Error fetching project workers:', error);
      showError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  const addWorker = async (worker: Omit<ProjectWorkerInput, 'project_id'>): Promise<ProjectWorker | null> => {
    if (!projectId) return null;
    try {
      const { data, error } = await supabase
        .from('project_workers')
        .insert({
          project_id: projectId,
          first_name: worker.first_name,
          last_name: worker.last_name,
          position: worker.position,
          work_hours: worker.work_hours,
          hourly_rate: worker.hourly_rate,
          work_start_time: worker.work_start_time || '08:00',
          work_end_time: worker.work_end_time || '16:00',
        })
        .select()
        .single();
      if (error) throw error;

      // Backfill initial rate history entry so rate_at() has a row from day 1.
      // (Migration backfill covers pre-existing rows; new rows use RPC below via
      // effective_from = today. Fire-and-forget: on failure user can retry via
      // rate edit; INSERT trigger will still create baseline on first payout.)
      try {
        await supabase.rpc('set_worker_hourly_rate', {
          p_worker_id: (data as any).id,
          p_rate: worker.hourly_rate,
          p_effective_from: new Date().toISOString().slice(0, 10),
        });
      } catch (e) {
        console.warn('[addWorker] initial rate history seed failed (non-fatal):', e);
      }

      const newWorker: WorkerWithStats = {
        ...(data as any),
        work_hours: Number((data as any).work_hours),
        hourly_rate: Number((data as any).hourly_rate),
        actualHoursTotal: 0,
        actualCostTotal: 0,
        currentMonthHours: 0,
        currentMonthCost: 0,
        remainingHours: 0,
        remainingCost: 0,
      };
      setWorkers((prev) => [newWorker, ...prev]);
      showSuccess(t('workers.added', 'Radnik dodan'));
      await fetchWorkers();
      return newWorker;
    } catch (error) {
      console.error('Error adding worker:', error);
      showError(t('common.error'));
      return null;
    }
  };

  /**
   * V1-B: change hourly rate through the RPC. Effective_from is REQUIRED.
   * Returns SetWorkerRateResult; caller (dialog) shows a friendly message on
   * collision including the earliest allowed date.
   */
  const setWorkerRate = async (
    workerId: string,
    rate: number,
    effectiveFrom: string, // YYYY-MM-DD
  ): Promise<SetWorkerRateResult> => {
    try {
      const { error } = await supabase.rpc('set_worker_hourly_rate', {
        p_worker_id: workerId,
        p_rate: rate,
        p_effective_from: effectiveFrom,
      });
      if (error) throw error;
      await fetchWorkers();
      return { success: true };
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      // Parse collision payload: 'rate_change_collides_with_payout|<uuid>|<date>'
      const m = msg.match(/rate_change_collides_with_payout\|([0-9a-f-]+)\|(\d{4}-\d{2}-\d{2})/);
      if (m) {
        return {
          success: false,
          collisionPayoutId: m[1],
          earliestAllowedDate: m[2],
          error: 'collision',
        };
      }
      if (msg.includes('not project owner')) {
        return { success: false, error: 'not_owner' };
      }
      console.error('set_worker_hourly_rate failed:', err);
      return { success: false, error: msg || 'unknown' };
    }
  };

  /**
   * V1-B: rate change goes through setWorkerRate — this UPDATE deliberately
   * OMITS hourly_rate. The DB guard trigger enforces the same at the schema
   * level.
   */
  const updateWorker = async (worker: ProjectWorker): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_workers')
        .update({
          first_name: worker.first_name,
          last_name: worker.last_name,
          position: worker.position,
          work_hours: worker.work_hours,
          work_start_time: worker.work_start_time,
          work_end_time: worker.work_end_time,
        })
        .eq('id', worker.id);
      if (error) throw error;
      await fetchWorkers();
      showSuccess(t('workers.updated', 'Radnik ažuriran'));
    } catch (error) {
      console.error('Error updating worker:', error);
      showError(t('common.error'));
    }
  };

  const deleteWorker = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_workers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setWorkers((prev) => prev.filter((w) => w.id !== id));
      setEntries((prev) => prev.filter((e) => e.worker_id !== id));
      showSuccess(t('workers.deleted', 'Radnik uklonjen'));
    } catch (error) {
      console.error('Error deleting worker:', error);
      showError(t('common.error'));
    }
  };

  const linkWorkerToMember = async (
    workerId: string,
    userId: string | null,
  ): Promise<{ success: boolean; backfilled?: number; error?: string }> => {
    try {
      const { data, error } = await supabase.rpc('link_worker_to_member', {
        _worker_id: workerId,
        _user_id: userId,
      });
      if (error) throw error;
      const result = (data as any) || {};
      await fetchWorkers();
      if (userId === null) {
        showSuccess(t('projects.workerUnlinked', 'Veza uklonjena'));
      } else {
        const n = Number(result.backfilled || 0);
        showSuccess(
          n > 0
            ? t('projects.workerLinkedWithBackfill', 'Povezano — obračunato {{count}} unosa', { count: n })
            : t('projects.workerLinkedNoBackfill', 'Povezano'),
        );
      }
      return { success: true, backfilled: Number(result.backfilled || 0) };
    } catch (err: any) {
      const msg = err?.message || '';
      const errMap: Record<string, string> = {
        not_authorized: t('projects.linkNotAuthorized', 'Nemate ovlast za povezivanje'),
        user_already_linked_to_other_worker: t('projects.userAlreadyLinked', 'Ovaj član je već povezan s drugim radnikom'),
        worker_not_found: t('projects.workerNotFound', 'Radnik nije pronađen'),
      };
      const known = Object.keys(errMap).find((k) => msg.includes(k));
      showError(known ? errMap[known] : t('common.error'));
      return { success: false, error: known || 'unknown' };
    }
  };

  const totalCost = workers.reduce((sum, w) => sum + w.actualCostTotal, 0);
  const totalActualHours = workers.reduce((sum, w) => sum + w.actualHoursTotal, 0);
  const totalRemainingCost = workers.reduce((sum, w) => sum + w.remainingCost, 0);
  const totalRemainingHours = workers.reduce((sum, w) => sum + w.remainingHours, 0);

  return {
    workers,
    entries,
    rateHistory,
    loading,
    addWorker,
    updateWorker,
    setWorkerRate,
    deleteWorker,
    linkWorkerToMember,
    refetch: fetchWorkers,
    totalCost,
    totalActualHours,
    totalRemainingCost,
    totalRemainingHours,
  };
};
