import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ActivityEntry {
  id: string;
  project_id: string;
  user_id?: string | null;
  action_type: string;
  action_description: string;
  metadata?: any;
  created_at: string;
  user_name?: string;
}

/**
 * Project activity feed.
 *
 * N+1 fix: activity_log fetch and member-profile lookup run in parallel
 * (Promise.all) instead of sequentially. The profile lookup uses the
 * SECURITY DEFINER RPC `get_project_member_profiles` because the public
 * `profiles` SELECT policy only exposes the caller's own row — a naive
 * embedded join would silently return NULL names for other members.
 *
 * Realtime: subscribes to `project_activity_log` changes for this project
 * and invalidates the query so the feed updates without manual refresh
 * (e.g. owner sees worker's actions live). RLS still enforces which rows
 * come back on refetch.
 */
export const useProjectActivity = (projectId: string | null) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ['project-activity', projectId, user?.id] as const;

  const query = useQuery({
    queryKey,
    enabled: !!projectId && !!user,
    staleTime: 15_000,
    queryFn: async (): Promise<ActivityEntry[]> => {
      if (!projectId) return [];
      const [activityRes, profilesRes] = await Promise.all([
        supabase
          .from('project_activity_log')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(100),
        (supabase as any).rpc('get_project_member_profiles', { _project_id: projectId }),
      ]);
      if (activityRes.error) throw activityRes.error;

      const nameMap = new Map<string, string>();
      const profileRows = (profilesRes?.data || []) as Array<{ user_id: string; display_name: string | null }>;
      profileRows.forEach((row) => {
        const name = (row.display_name || '').trim();
        if (name) nameMap.set(row.user_id, name);
      });

      return (activityRes.data || []).map((a: any) => ({
        ...a,
        user_name: a.user_id ? nameMap.get(a.user_id) : undefined,
      }));
    },
  });

  useEffect(() => {
    if (!projectId || !user) return;
    const channel = supabase
      .channel(`project-activity-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_activity_log',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user?.id]);

  return {
    activities: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
};

export const logProjectActivity = async (
  projectId: string,
  userId: string,
  action_type: string,
  action_description: string,
  metadata?: any
) => {
  try {
    await supabase.from('project_activity_log').insert({
      project_id: projectId,
      user_id: userId,
      action_type,
      action_description,
      metadata: metadata || null,
    });
  } catch (e) {
    console.error('activity log failed', e);
  }
};
