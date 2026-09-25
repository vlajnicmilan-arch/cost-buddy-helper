import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import {
  computeUnratedWorkerMembers,
  type MemberLite,
  type WorkLogLite,
  type UnratedPending,
} from '@/lib/unratedWorkerMembers';

/**
 * Loads data for the "no hourly rate" warning. Only runs for managers
 * (`enabled`) and only when a worker-role member exists.
 */
export const useUnratedWorkerMembers = (
  projectId: string,
  members: MemberLite[],
  enabled: boolean,
) => {
  const workerIds = useMemo(
    () => members.filter((m) => m.role === 'worker' && m.user_id).map((m) => m.user_id).sort(),
    [members],
  );
  const workerKey = workerIds.join(',');
  const [linked, setLinked] = useState<string[]>([]);
  const [logs, setLogs] = useState<WorkLogLite[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || workerIds.length === 0) {
      setLinked([]);
      setLogs([]);
      setLoaded(true);
      return;
    }
    // Any project_workers row (incl. archived) counts — sync_work_log_to_entry matches it too.
    const [pwRes, logRes] = await Promise.all([
      supabase.from('project_workers').select('user_id').eq('project_id', projectId).in('user_id', workerIds),
      supabase
        .from('project_work_logs')
        .select('user_id, log_date, hours')
        .eq('project_id', projectId)
        .in('user_id', workerIds),
    ]);
    const err = pwRes.error || logRes.error;
    if (err) {
      logDiagnostic({
        event: 'unrated_worker_load_failed',
        severity: 'warning',
        details: { project_id: projectId, db_code: err.code ?? null, db_message: err.message },
      });
      setLoaded(false);
      return;
    }
    setLinked((pwRes.data ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean) as string[]);
    setLogs((logRes.data ?? []) as WorkLogLite[]);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectId, workerKey]);

  useEffect(() => {
    load();
  }, [load]);

  const pending: Map<string, UnratedPending> = useMemo(
    () => (loaded && enabled ? computeUnratedWorkerMembers(members, linked, logs) : new Map()),
    [loaded, enabled, members, linked, logs],
  );

  return { pending, refetch: load };
};
