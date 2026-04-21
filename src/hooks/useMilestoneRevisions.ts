import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MilestoneBudgetRevision } from '@/types/milestoneRevision';

/**
 * Fetches and exposes budget revisions for a single milestone or for an entire project.
 * Pass `milestoneId` for per-milestone history; pass only `projectId` for an aggregated feed.
 */
export const useMilestoneRevisions = (
  projectId: string | null,
  milestoneId?: string | null
) => {
  const { user } = useAuth();
  const [revisions, setRevisions] = useState<MilestoneBudgetRevision[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user || !projectId) {
      setRevisions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from('milestone_budget_revisions' as any)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (milestoneId) {
        query = query.eq('milestone_id', milestoneId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRevisions((data as any[]) as MilestoneBudgetRevision[]);
    } catch (err) {
      console.error('Failed to load milestone revisions:', err);
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  }, [user, projectId, milestoneId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { revisions, loading, refetch: fetch };
};
