import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AuditRow {
  id: string;
  group_id: string;
  user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_data: any;
  after_data: any;
  created_at: string;
  actor_name?: string | null;
}

/**
 * Lists family_split_audit rows for a group, most recent first.
 * RLS lets all members read audit entries (transparency requirement).
 */
export function useFamilySplitAudit(groupId: string | null | undefined, limit = 50) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('family_split_audit')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
      let profiles: any[] = [];
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        profiles = profs ?? [];
      }

      const mapped: AuditRow[] = (data ?? []).map((r: any) => ({
        ...r,
        actor_name:
          profiles.find((p) => p.user_id === r.user_id)?.display_name ?? null,
      }));
      setRows(mapped);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [groupId, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, reload: load };
}
