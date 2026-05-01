import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import type { ProjectWorkLog, ProjectWorkLogInput, WorkLogHoursSummary } from '@/types/projectWorkLog';

export const useProjectWorkLogs = (projectId: string | null) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [logs, setLogs] = useState<ProjectWorkLog[]>([]);
  const [hoursByDate, setHoursByDate] = useState<Record<string, WorkLogHoursSummary[]>>({});
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!projectId || !user) {
      setLogs([]);
      setHoursByDate({});
      return;
    }
    setLoading(true);
    try {
      // 1) work logs
      const { data: logRows, error: logErr } = await (supabase as any)
        .from('project_work_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (logErr) throw logErr;

      // 2) milestones (for names)
      const { data: msRows } = await supabase
        .from('project_milestones')
        .select('id, name')
        .eq('project_id', projectId);
      const msMap = new Map<string, string>((msRows || []).map((m: any) => [m.id, m.name]));

      // 3) profile names for authors
      const userIds = Array.from(
        new Set((logRows || []).map((r: any) => r.user_id).filter(Boolean))
      ) as string[];
      const nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        profiles?.forEach((p: any) => nameMap.set(p.user_id, p.display_name || ''));
      }

      const enriched: ProjectWorkLog[] = (logRows || []).map((r: any) => ({
        ...r,
        user_name: r.user_id ? nameMap.get(r.user_id) : undefined,
        milestone_name: r.milestone_id ? msMap.get(r.milestone_id) : undefined,
      }));
      setLogs(enriched);

      // 4) Auto worker-hours summary for distinct dates
      const dates = Array.from(new Set(enriched.map((l) => l.log_date)));
      if (dates.length > 0) {
        const [entriesRes, workersRes] = await Promise.all([
          supabase
            .from('project_work_entries')
            .select('worker_id, work_date, actual_hours')
            .eq('project_id', projectId)
            .in('work_date', dates),
          supabase
            .from('project_workers')
            .select('id, first_name, last_name')
            .eq('project_id', projectId),
        ]);
        const wMap = new Map<string, string>();
        (workersRes.data || []).forEach((w: any) => {
          wMap.set(w.id, `${w.first_name} ${w.last_name}`.trim());
        });
        const grouped: Record<string, Map<string, WorkLogHoursSummary>> = {};
        (entriesRes.data || []).forEach((e: any) => {
          if (!grouped[e.work_date]) grouped[e.work_date] = new Map();
          const bucket = grouped[e.work_date];
          const existing = bucket.get(e.worker_id);
          const hours = Number(e.actual_hours) || 0;
          if (existing) {
            existing.actual_hours += hours;
          } else {
            bucket.set(e.worker_id, {
              worker_id: e.worker_id,
              worker_name: wMap.get(e.worker_id) || '?',
              actual_hours: hours,
            });
          }
        });
        const result: Record<string, WorkLogHoursSummary[]> = {};
        Object.entries(grouped).forEach(([date, m]) => {
          result[date] = Array.from(m.values()).sort((a, b) => b.actual_hours - a.actual_hours);
        });
        setHoursByDate(result);
      } else {
        setHoursByDate({});
      }
    } catch (e) {
      console.error('[useProjectWorkLogs] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const create = async (input: ProjectWorkLogInput): Promise<boolean> => {
    if (!user || !projectId) return false;
    try {
      const { error } = await (supabase as any).from('project_work_logs').insert({
        project_id: projectId,
        user_id: user.id,
        log_date: input.log_date,
        weather: input.weather || null,
        summary: input.summary,
        notes: input.notes || null,
        milestone_id: input.milestone_id || null,
        hours: input.hours ?? null,
        day_type: input.day_type || 'work',
        clock_in_time: input.clock_in_time || null,
        clock_out_time: input.clock_out_time || null,
      });
      if (error) throw error;
      showSuccess(t('workLog.saved', 'Dnevnik spremljen'));
      await fetchAll();
      return true;
    } catch (e: any) {
      console.error(e);
      if (e?.code === '23505') {
        showError(t('workLog.duplicate', 'Već postoji tvoj zapis za taj dan'));
      } else {
        showError(t('common.error'));
      }
      return false;
    }
  };

  const update = async (id: string, input: Partial<ProjectWorkLogInput>): Promise<boolean> => {
    try {
      const patch: any = {};
      if (input.log_date !== undefined) patch.log_date = input.log_date;
      if (input.weather !== undefined) patch.weather = input.weather || null;
      if (input.summary !== undefined) patch.summary = input.summary;
      if (input.notes !== undefined) patch.notes = input.notes || null;
      if (input.milestone_id !== undefined) patch.milestone_id = input.milestone_id || null;
      if (input.hours !== undefined) patch.hours = input.hours ?? null;
      if (input.day_type !== undefined) patch.day_type = input.day_type || 'work';
      if (input.clock_in_time !== undefined) patch.clock_in_time = input.clock_in_time || null;
      if (input.clock_out_time !== undefined) patch.clock_out_time = input.clock_out_time || null;
      const { error } = await (supabase as any).from('project_work_logs').update(patch).eq('id', id);
      if (error) throw error;
      showSuccess(t('workLog.updated', 'Dnevnik ažuriran'));
      await fetchAll();
      return true;
    } catch (e) {
      console.error(e);
      showError(t('common.error'));
      return false;
    }
  };

  const remove = async (id: string): Promise<boolean> => {
    try {
      const { error } = await (supabase as any).from('project_work_logs').delete().eq('id', id);
      if (error) throw error;
      showSuccess(t('workLog.deleted', 'Dnevnik obrisan'));
      setLogs((prev) => prev.filter((l) => l.id !== id));
      return true;
    } catch (e) {
      console.error(e);
      showError(t('common.error'));
      return false;
    }
  };

  return useMemo(
    () => ({ logs, hoursByDate, loading, create, update, remove, refetch: fetchAll }),
    [logs, hoursByDate, loading, fetchAll]
  );
};
