import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ProjectContractAmendment {
  id: string;
  project_id: string;
  user_id: string;
  amendment_amount: number;
  note: string | null;
  linked_revision_id: string | null;
  linked_milestone_id: string | null;
  created_at: string;
}

/**
 * Fetches contract amendments (aneksi ugovora) for a project.
 * Each amendment is a positive delta added to projects.contract_value.
 */
export const useProjectContractAmendments = (projectId: string | null) => {
  const { user } = useAuth();
  const [amendments, setAmendments] = useState<ProjectContractAmendment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user || !projectId) {
      setAmendments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_contract_amendments' as any)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAmendments(((data as any[]) || []).map((r) => ({
        ...r,
        amendment_amount: Number(r.amendment_amount) || 0,
      })));
    } catch (err) {
      console.error('Failed to load contract amendments:', err);
      setAmendments([]);
    } finally {
      setLoading(false);
    }
  }, [user, projectId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const total = amendments.reduce((s, a) => s + (Number(a.amendment_amount) || 0), 0);

  return { amendments, loading, total, refetch: fetch };
};
