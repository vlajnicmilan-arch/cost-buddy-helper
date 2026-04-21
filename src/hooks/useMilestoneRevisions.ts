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

  /** Number of revisions for a given milestone (counts both primary and linked entries). */
  const getRevisionCount = useCallback(
    (mid: string) => revisions.filter((r) => r.milestone_id === mid).length,
    [revisions]
  );

  /**
   * Net budget delta for a milestone over the last N days.
   * Positive = budget grew (overrun trend), negative = budget shrunk (saving trend), null = no recent revisions.
   */
  const getRecentTrend = useCallback(
    (mid: string, days = 30): { delta: number; count: number } | null => {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const recent = revisions.filter(
        (r) => r.milestone_id === mid && new Date(r.created_at).getTime() >= cutoff
      );
      if (recent.length === 0) return null;
      const delta = recent.reduce((sum, r) => sum + (Number(r.delta) || 0), 0);
      return { delta, count: recent.length };
    },
    [revisions]
  );

  return { revisions, loading, refetch: fetch, getRevisionCount, getRecentTrend };
};
