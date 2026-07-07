import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProjectWorker, ProjectWorkerInput, ProjectWorkEntry } from '@/types/projectWorker';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

interface WorkEntryLite {
  worker_id: string;
  work_date: string;
  actual_hours: number;
  payout_id?: string | null;
}

interface WorkerWithStats extends ProjectWorker {
  actualHoursTotal: number;
  actualCostTotal: number;
  currentMonthHours: number;
  currentMonthCost: number;
  remainingHours: number;
  remainingCost: number;
}

export const useProjectWorkers = (projectId: string | null) => {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<WorkerWithStats[]>([]);
  const [entries, setEntries] = useState<WorkEntryLite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkers = useCallback(async () => {
    if (!projectId) {
      setWorkers([]);
      setEntries([]);
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
          .select('worker_id, actual_hours, work_date')
          .eq('project_id', projectId)
      ]);

      if (workersRes.error) throw workersRes.error;
      
      const rawEntries = (entriesRes.data || []).map(e => ({
        worker_id: e.worker_id,
        work_date: e.work_date,
        actual_hours: Number(e.actual_hours),
      }));

      // Calculate totals
      const hoursByWorker: Record<string, number> = {};
      const currentMonthHoursByWorker: Record<string, number> = {};

      const now = new Date();
      const cmStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const cmEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      rawEntries.forEach(entry => {
        hoursByWorker[entry.worker_id] = (hoursByWorker[entry.worker_id] || 0) + entry.actual_hours;
        const d = new Date(entry.work_date);
        if (d >= cmStart && d < cmEnd) {
          currentMonthHoursByWorker[entry.worker_id] = (currentMonthHoursByWorker[entry.worker_id] || 0) + entry.actual_hours;
        }
      });
      
      const workersWithStats: WorkerWithStats[] = (workersRes.data || []).map(w => {
        const actualHours = hoursByWorker[w.id] || 0;
        const cmHours = currentMonthHoursByWorker[w.id] || 0;
        const hourlyRate = Number(w.hourly_rate);
        return {
          ...w,
          work_hours: Number(w.work_hours),
          hourly_rate: hourlyRate,
          actualHoursTotal: actualHours,
          actualCostTotal: actualHours * hourlyRate,
          currentMonthHours: cmHours,
          currentMonthCost: cmHours * hourlyRate,
        };
      });
      
      setWorkers(workersWithStats);
      setEntries(rawEntries);
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
          work_end_time: worker.work_end_time || '16:00'
        })
        .select()
        .single();

      if (error) throw error;

      const newWorker: WorkerWithStats = {
        ...data,
        work_hours: Number(data.work_hours),
        hourly_rate: Number(data.hourly_rate),
        actualHoursTotal: 0,
        actualCostTotal: 0,
        currentMonthHours: 0,
        currentMonthCost: 0,
      };

      setWorkers(prev => [newWorker, ...prev]);
      showSuccess(t('workers.added', 'Radnik dodan'));
      return newWorker;
    } catch (error) {
      console.error('Error adding worker:', error);
      showError(t('common.error'));
      return null;
    }
  };

  const updateWorker = async (worker: ProjectWorker): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_workers')
        .update({
          first_name: worker.first_name,
          last_name: worker.last_name,
          position: worker.position,
          work_hours: worker.work_hours,
          hourly_rate: worker.hourly_rate,
          work_start_time: worker.work_start_time,
          work_end_time: worker.work_end_time
        })
        .eq('id', worker.id);

      if (error) throw error;

      setWorkers(prev => prev.map(w => {
        if (w.id === worker.id) {
          return {
            ...worker,
            actualHoursTotal: w.actualHoursTotal,
            actualCostTotal: w.actualHoursTotal * worker.hourly_rate,
            currentMonthHours: w.currentMonthHours,
            currentMonthCost: w.currentMonthHours * worker.hourly_rate,
          };
        }
        return w;
      }));
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

      setWorkers(prev => prev.filter(w => w.id !== id));
      setEntries(prev => prev.filter(e => e.worker_id !== id));
      showSuccess(t('workers.deleted', 'Radnik uklonjen'));
    } catch (error) {
      console.error('Error deleting worker:', error);
      showError(t('common.error'));
    }
  };

  const linkWorkerToMember = async (
    workerId: string,
    userId: string | null
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
            : t('projects.workerLinkedNoBackfill', 'Povezano')
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

  // Total cost based on actual worked hours
  const totalCost = workers.reduce((sum, w) => sum + w.actualCostTotal, 0);
  const totalActualHours = workers.reduce((sum, w) => sum + w.actualHoursTotal, 0);

  return {
    workers,
    entries,
    loading,
    addWorker,
    updateWorker,
    deleteWorker,
    linkWorkerToMember,
    refetch: fetchWorkers,
    totalCost,
    totalActualHours
  };
};
