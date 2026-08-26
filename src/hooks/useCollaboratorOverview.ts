/**
 * "Suradnici" — cross-project, read-only overview of `project_collaborators`.
 *
 * Queries ONLY projects + project_collaborators. Hourly-work tables are
 * deliberately never touched here, and this hook performs no writes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import {
  groupCollaborators,
  sortCollaboratorRows,
  type CollaboratorGroup,
  type CollaboratorRow,
} from '@/lib/collaboratorOverview';

export const useCollaboratorOverview = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<CollaboratorRow[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setRows([]);
      setProjectNames({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: projects, error: projectsErr } = await supabase
        .from('projects')
        .select('id, name, business_profile_id')
        .eq('user_id', user.id)
        .is('deleted_at', null);
      if (projectsErr) throw projectsErr;

      const names: Record<string, string> = {};
      const profileByProject: Record<string, string | null> = {};
      for (const p of projects ?? []) {
        names[(p as any).id] = (p as any).name;
        profileByProject[(p as any).id] = (p as any).business_profile_id ?? null;
      }
      const projectIds = Object.keys(names);

      let collaborators: CollaboratorRow[] = [];
      if (projectIds.length > 0) {
        const { data, error: collabErr } = await (supabase.from('project_collaborators') as any)
          .select('id, project_id, first_name, last_name, company_name, service_description, total_price, paid_amount, status')
          .in('project_id', projectIds);
        if (collabErr) throw collabErr;
        collaborators = (data ?? []).map((c: any) => ({
          id: c.id,
          project_id: c.project_id,
          first_name: c.first_name ?? '',
          last_name: c.last_name ?? '',
          company_name: c.company_name ?? null,
          service_description: c.service_description ?? null,
          total_price: Number(c.total_price) || 0,
          paid_amount: Number(c.paid_amount) || 0,
          status: c.status ?? 'active',
          business_profile_id: profileByProject[c.project_id] ?? null,
        }));
      }

      setProjectNames(names);
      setRows(collaborators);
    } catch (e: any) {
      setError(e?.message ?? 'unknown');
      logDiagnostic({
        event: 'collaborator_overview_fetch_failed',
        severity: 'error',
        details: { message: e?.message ?? null, code: e?.code ?? null },
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const groups: CollaboratorGroup[] = useMemo(
    () => sortCollaboratorRows(groupCollaborators(rows, projectNames)),
    [rows, projectNames],
  );

  return { rows, groups, projectNames, loading, error, refetch: fetchAll };
};
