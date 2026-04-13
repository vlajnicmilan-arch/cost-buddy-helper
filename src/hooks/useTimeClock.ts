import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TimeClockEntry, WorkerDayStatus, WorkerClockStatus, distributeHours, EntryType } from '@/types/timeClock';
import { ProjectWorker } from '@/types/projectWorker';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

export const useTimeClock = (projectId: string | null) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<TimeClockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const fetchEntries = useCallback(async () => {
    if (!projectId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_clock_entries')
        .select('*')
        .eq('project_id', projectId)
        .eq('work_date', dateStr)
        .order('clock_in', { ascending: true });

      if (error) throw error;
      setEntries((data || []) as TimeClockEntry[]);
    } catch (error) {
      console.error('Error fetching time clock entries:', error);
      showError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [projectId, dateStr, t]);

  // Fetch entries for a date range (for monthly report)
  const fetchEntriesRange = useCallback(async (startDate: string, endDate: string): Promise<TimeClockEntry[]> => {
    if (!projectId) return [];

    try {
      const { data, error } = await supabase
        .from('time_clock_entries')
        .select('*')
        .eq('project_id', projectId)
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date', { ascending: true });

      if (error) throw error;
      return (data || []) as TimeClockEntry[];
    } catch (error) {
      console.error('Error fetching time clock range:', error);
      return [];
    }
  }, [projectId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const getWorkerStatuses = useCallback((workers: ProjectWorker[]): WorkerDayStatus[] => {
    return workers.map(worker => {
      const workerEntries = entries.filter(e => e.worker_id === worker.id);
      const todayEntry = workerEntries[0] || null;

      let status: WorkerClockStatus = 'not_arrived';
      let totalHours = 0;

      if (todayEntry) {
        if (todayEntry.absence_type) {
          status = 'absent';
        } else if (todayEntry.status === 'completed') {
          status = 'finished';
          totalHours = Number(todayEntry.net_hours);
        } else if (todayEntry.break_start && !todayEntry.break_end) {
          status = 'on_break';
        } else if (todayEntry.clock_in && !todayEntry.clock_out) {
          status = 'working';
        }
      }

      return {
        workerId: worker.id,
        workerName: `${worker.first_name} ${worker.last_name}`,
        status,
        entry: todayEntry,
        clockInTime: todayEntry?.clock_in || null,
        totalHours
      };
    });
  }, [entries]);

  const clockIn = async (workerId: string, userId: string, entryType: string = 'regular') => {
    if (!projectId) return;

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('time_clock_entries')
        .insert({
          worker_id: workerId,
          project_id: projectId,
          user_id: userId,
          recorded_by: userId,
          work_date: dateStr,
          clock_in: now,
          entry_type: entryType,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;
      setEntries(prev => [...prev, data as TimeClockEntry]);
      showSuccess(t('timeClock.clockedIn', 'Dolazak zabilježen'));
    } catch (error) {
      console.error('Error clocking in:', error);
      showError(t('common.error'));
    }
  };

  const clockOut = async (entryId: string) => {
    try {
      const entry = entries.find(e => e.id === entryId);
      if (!entry?.clock_in) return;

      const now = new Date();
      const clockInTime = new Date(entry.clock_in);
      const grossMinutes = (now.getTime() - clockInTime.getTime()) / 60000;
      const netHours = Math.max(0, (grossMinutes - (entry.break_minutes || 0)) / 60);

      // Auto-distribute hours into legal categories
      const breakdown = distributeHours(netHours, entry.entry_type as EntryType, selectedDate);

      const { data, error } = await supabase
        .from('time_clock_entries')
        .update({
          clock_out: now.toISOString(),
          net_hours: breakdown.net_hours,
          status: 'completed',
          regular_hours: breakdown.regular_hours,
          overtime_hours: breakdown.overtime_hours,
          night_hours: breakdown.night_hours,
          sunday_hours: breakdown.sunday_hours,
          holiday_hours: breakdown.holiday_hours,
          standby_hours: breakdown.standby_hours,
          field_hours: breakdown.field_hours
        })
        .eq('id', entryId)
        .select()
        .single();

      if (error) throw error;
      setEntries(prev => prev.map(e => e.id === entryId ? (data as TimeClockEntry) : e));
      showSuccess(t('timeClock.clockedOut', 'Odlazak zabilježen'));
    } catch (error) {
      console.error('Error clocking out:', error);
      showError(t('common.error'));
    }
  };

  const startBreak = async (entryId: string) => {
    try {
      const { data, error } = await supabase
        .from('time_clock_entries')
        .update({ break_start: new Date().toISOString() })
        .eq('id', entryId)
        .select()
        .single();

      if (error) throw error;
      setEntries(prev => prev.map(e => e.id === entryId ? (data as TimeClockEntry) : e));
      showSuccess(t('timeClock.breakStarted', 'Pauza započeta'));
    } catch (error) {
      console.error('Error starting break:', error);
      showError(t('common.error'));
    }
  };

  const endBreak = async (entryId: string) => {
    try {
      const entry = entries.find(e => e.id === entryId);
      if (!entry?.break_start) return;

      const breakEnd = new Date();
      const breakStart = new Date(entry.break_start);
      const breakMinutes = Math.round((breakEnd.getTime() - breakStart.getTime()) / 60000);

      const { data, error } = await supabase
        .from('time_clock_entries')
        .update({
          break_end: breakEnd.toISOString(),
          break_minutes: (entry.break_minutes || 0) + breakMinutes
        })
        .eq('id', entryId)
        .select()
        .single();

      if (error) throw error;
      setEntries(prev => prev.map(e => e.id === entryId ? (data as TimeClockEntry) : e));
      showSuccess(t('timeClock.breakEnded', 'Pauza završena'));
    } catch (error) {
      console.error('Error ending break:', error);
      showError(t('common.error'));
    }
  };

  const addAbsence = async (workerId: string, userId: string, absenceType: string, note?: string) => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase
        .from('time_clock_entries')
        .insert({
          worker_id: workerId,
          project_id: projectId,
          user_id: userId,
          recorded_by: userId,
          work_date: dateStr,
          entry_type: 'regular',
          absence_type: absenceType,
          note: note || null,
          status: 'completed',
          net_hours: 0
        })
        .select()
        .single();

      if (error) throw error;
      setEntries(prev => [...prev, data as TimeClockEntry]);
      showSuccess(t('timeClock.absenceAdded', 'Odsutnost zabilježena'));
    } catch (error) {
      console.error('Error adding absence:', error);
      showError(t('common.error'));
    }
  };

  // Quick entry: user enters total hours, system auto-fills legal breakdown
  const addQuickEntry = async (
    workerId: string,
    userId: string,
    totalHours: number,
    entryType: EntryType,
    note?: string
  ) => {
    if (!projectId) return;

    try {
      const breakdown = distributeHours(totalHours, entryType, selectedDate);
      
      // Generate clock_in/clock_out from hours (e.g. 08:00 + totalHours)
      const clockIn = new Date(selectedDate);
      clockIn.setHours(8, 0, 0, 0);
      const clockOut = new Date(clockIn.getTime() + (totalHours * 60 + breakdown.break_minutes) * 60000);

      const { data, error } = await supabase
        .from('time_clock_entries')
        .insert({
          worker_id: workerId,
          project_id: projectId,
          user_id: userId,
          recorded_by: userId,
          work_date: dateStr,
          clock_in: clockIn.toISOString(),
          clock_out: clockOut.toISOString(),
          break_minutes: breakdown.break_minutes,
          net_hours: breakdown.net_hours,
          entry_type: entryType,
          status: 'completed',
          regular_hours: breakdown.regular_hours,
          overtime_hours: breakdown.overtime_hours,
          night_hours: breakdown.night_hours,
          sunday_hours: breakdown.sunday_hours,
          holiday_hours: breakdown.holiday_hours,
          standby_hours: breakdown.standby_hours,
          field_hours: breakdown.field_hours,
          note: note || null
        })
        .select()
        .single();

      if (error) throw error;
      setEntries(prev => [...prev, data as TimeClockEntry]);
      showSuccess(t('timeClock.entryAdded', 'Unos spremljen'));
    } catch (error) {
      console.error('Error adding quick entry:', error);
      showError(t('common.error'));
    }
  };

  const deleteEntry = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from('time_clock_entries')
        .delete()
        .eq('id', entryId);

      if (error) throw error;
      setEntries(prev => prev.filter(e => e.id !== entryId));
      showSuccess(t('timeClock.entryDeleted', 'Zapis obrisan'));
    } catch (error) {
      console.error('Error deleting entry:', error);
      showError(t('common.error'));
    }
  };

  return {
    entries,
    loading,
    selectedDate,
    setSelectedDate,
    getWorkerStatuses,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    addAbsence,
    addQuickEntry,
    deleteEntry,
    fetchEntriesRange,
    refetch: fetchEntries
  };
};
