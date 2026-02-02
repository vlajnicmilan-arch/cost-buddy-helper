import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProjectWorker, ProjectWorkerInput } from '@/types/projectWorker';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const useProjectWorkers = (projectId: string | null) => {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<ProjectWorker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkers = useCallback(async () => {
    if (!projectId) {
      setWorkers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_workers')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setWorkers((data || []).map(w => ({
        ...w,
        work_hours: Number(w.work_hours),
        hourly_rate: Number(w.hourly_rate)
      })));
    } catch (error) {
      console.error('Error fetching project workers:', error);
      toast.error(t('common.error'));
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

      const newWorker: ProjectWorker = {
        ...data,
        work_hours: Number(data.work_hours),
        hourly_rate: Number(data.hourly_rate)
      };

      setWorkers(prev => [newWorker, ...prev]);
      toast.success(t('workers.added', 'Radnik dodan'));
      return newWorker;
    } catch (error) {
      console.error('Error adding worker:', error);
      toast.error(t('common.error'));
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

      setWorkers(prev => prev.map(w => w.id === worker.id ? worker : w));
      toast.success(t('workers.updated', 'Radnik ažuriran'));
    } catch (error) {
      console.error('Error updating worker:', error);
      toast.error(t('common.error'));
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
      toast.success(t('workers.deleted', 'Radnik uklonjen'));
    } catch (error) {
      console.error('Error deleting worker:', error);
      toast.error(t('common.error'));
    }
  };

  const totalCost = workers.reduce((sum, w) => sum + (w.work_hours * w.hourly_rate), 0);

  return {
    workers,
    loading,
    addWorker,
    updateWorker,
    deleteWorker,
    refetch: fetchWorkers,
    totalCost
  };
};
