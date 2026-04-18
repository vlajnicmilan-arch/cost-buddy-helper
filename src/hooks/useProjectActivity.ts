import { useState, useEffect, useCallback } from 'react';
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

export const useProjectActivity = (projectId: string | null) => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!projectId || !user) { setActivities([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_activity_log')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const userIds = Array.from(new Set((data || []).map(a => a.user_id).filter(Boolean))) as string[];
      let nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        profiles?.forEach(p => nameMap.set(p.user_id, p.display_name || ''));
      }
      setActivities((data || []).map(a => ({ ...a, user_name: a.user_id ? nameMap.get(a.user_id) : undefined })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId, user]);

  useEffect(() => { fetch(); }, [fetch]);

  return { activities, loading, refetch: fetch };
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
