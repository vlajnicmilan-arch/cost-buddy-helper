import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProjectWorkEntry } from '@/types/projectWorker';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export const useProjectWorkEntries = (workerId: string | null, projectId: string | null) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ProjectWorkEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    if (!workerId || !projectId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_work_entries')
        .select('*')
        .eq('worker_id', workerId)
        .order('work_date', { ascending: false });

      if (error) throw error;
      
      setEntries((data || []).map(e => ({
        ...e,
        scheduled_hours: Number(e.scheduled_hours),
        actual_hours: Number(e.actual_hours)
      })));
    } catch (error) {
      console.error('Error fetching work entries:', error);
    } finally {
      setLoading(false);
    }
  }, [workerId, projectId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Realtime: filter by worker_id so a worker's tab refetches only on their own
  // rows; owner viewing per-worker tab also refetches on that worker's changes.
  // RLS still enforces visibility on the refetch itself.
  useEffect(() => {
    if (!workerId || !projectId) return;
    const channel = supabase
      .channel(`work-entries-${workerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_work_entries', filter: `worker_id=eq.${workerId}` },
        () => { fetchEntries(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workerId, projectId, fetchEntries]);

  const addEntry = async (entry: {
    work_date: string;
    scheduled_hours: number;
    actual_hours: number;
    note?: string;
    milestone_ids?: string[];
  }): Promise<ProjectWorkEntry | null> => {
    if (!workerId || !projectId) return null;

    try {
      const { data, error } = await supabase
        .from('project_work_entries')
        .insert({
          worker_id: workerId,
          project_id: projectId,
          work_date: entry.work_date,
          scheduled_hours: entry.scheduled_hours,
          actual_hours: entry.actual_hours,
          note: entry.note || null,
          milestone_ids: entry.milestone_ids || []
        })
        .select()
        .single();

      if (error) throw error;

      const newEntry: ProjectWorkEntry = {
        ...data,
        scheduled_hours: Number(data.scheduled_hours),
        actual_hours: Number(data.actual_hours)
      };

      setEntries(prev => [newEntry, ...prev].sort((a, b) => 
        new Date(b.work_date).getTime() - new Date(a.work_date).getTime()
      ));
      showSuccess(t('workers.entryAdded', 'Radni dan dodan'));
      return newEntry;
    } catch (error: any) {
      if (error.code === '23505') {
        showError(t('workers.entryExists', 'Unos za ovaj datum već postoji'));
      } else {
        console.error('Error adding work entry:', error);
        showError(t('common.error'));
      }
      return null;
    }
  };

  const updateEntry = async (entry: ProjectWorkEntry): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_work_entries')
        .update({
          scheduled_hours: entry.scheduled_hours,
          actual_hours: entry.actual_hours,
          note: entry.note,
          milestone_ids: entry.milestone_ids || []
        })
        .eq('id', entry.id);

      if (error) throw error;

      setEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
      showSuccess(t('workers.entryUpdated', 'Radni dan ažuriran'));
    } catch (error) {
      console.error('Error updating work entry:', error);
      showError(t('common.error'));
    }
  };

  const deleteEntry = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_work_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setEntries(prev => prev.filter(e => e.id !== id));
      showSuccess(t('workers.entryDeleted', 'Radni dan uklonjen'));
    } catch (error) {
      console.error('Error deleting work entry:', error);
      showError(t('common.error'));
    }
  };

  const addMultipleEntries = async (entriesData: {
    work_date: string;
    scheduled_hours: number;
    actual_hours: number;
    milestone_ids?: string[];
  }[]): Promise<boolean> => {
    if (!workerId || !projectId || entriesData.length === 0) return false;

    try {
      const inserts = entriesData.map(entry => ({
        worker_id: workerId,
        project_id: projectId,
        work_date: entry.work_date,
        scheduled_hours: entry.scheduled_hours,
        actual_hours: entry.actual_hours,
        milestone_ids: entry.milestone_ids || []
      }));

      const { data, error } = await supabase
        .from('project_work_entries')
        .insert(inserts)
        .select();

      if (error) throw error;

      const newEntries: ProjectWorkEntry[] = (data || []).map(e => ({
        ...e,
        scheduled_hours: Number(e.scheduled_hours),
        actual_hours: Number(e.actual_hours)
      }));

      setEntries(prev => [...newEntries, ...prev].sort((a, b) => 
        new Date(b.work_date).getTime() - new Date(a.work_date).getTime()
      ));
      
      showSuccess(t('workers.entriesAdded', '{{count}} radnih dana dodano', { count: newEntries.length }));
      return true;
    } catch (error: any) {
      console.error('Error adding work entries:', error);
      showError(t('common.error'));
      return false;
    }
  };

  const totalActualHours = entries.reduce((sum, e) => sum + e.actual_hours, 0);
  const totalScheduledHours = entries.reduce((sum, e) => sum + e.scheduled_hours, 0);

  return {
    entries,
    loading,
    addEntry,
    addMultipleEntries,
    updateEntry,
    deleteEntry,
    refetch: fetchEntries,
    totalActualHours,
    totalScheduledHours
  };
};
