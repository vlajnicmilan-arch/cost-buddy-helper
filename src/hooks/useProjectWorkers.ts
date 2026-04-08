import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProjectWorker, ProjectWorkerInput, ProjectWorkEntry } from '@/types/projectWorker';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

interface WorkerWithStats extends ProjectWorker {
  actualHoursTotal: number;
  actualCostTotal: number;
}

export const useProjectWorkers = (projectId: string | null) => {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<WorkerWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkers = useCallback(async () => {
    if (!projectId) {
      setWorkers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch workers and their work entries in parallel
      const [workersRes, entriesRes] = await Promise.all([
        supabase
          .from('project_workers')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_work_entries')
          .select('worker_id, actual_hours')
          .eq('project_id', projectId)
      ]);

      if (workersRes.error) throw workersRes.error;
      
      const entries = entriesRes.data || [];
      
      // Calculate actual hours per worker
      const hoursByWorker: Record<string, number> = {};
      entries.forEach(entry => {
        hoursByWorker[entry.worker_id] = (hoursByWorker[entry.worker_id] || 0) + Number(entry.actual_hours);
      });
      
      const workersWithStats: WorkerWithStats[] = (workersRes.data || []).map(w => {
        const actualHours = hoursByWorker[w.id] || 0;
        const hourlyRate = Number(w.hourly_rate);
        return {
          ...w,
          work_hours: Number(w.work_hours),
          hourly_rate: hourlyRate,
          actualHoursTotal: actualHours,
          actualCostTotal: actualHours * hourlyRate
        };
      });
      
      setWorkers(workersWithStats);
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
        actualCostTotal: 0
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
            actualCostTotal: w.actualHoursTotal * worker.hourly_rate
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
      showSuccess(t('workers.deleted', 'Radnik uklonjen'));
    } catch (error) {
      console.error('Error deleting worker:', error);
      showError(t('common.error'));
    }
  };

  // Total cost based on actual worked hours
  const totalCost = workers.reduce((sum, w) => sum + w.actualCostTotal, 0);
  const totalActualHours = workers.reduce((sum, w) => sum + w.actualHoursTotal, 0);

  return {
    workers,
    loading,
    addWorker,
    updateWorker,
    deleteWorker,
    refetch: fetchWorkers,
    totalCost,
    totalActualHours
  };
};
