import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const OPTIONAL_TABS = ['timeline', 'milestones', 'workers', 'collaborators', 'funding', 'transactions'] as const;
export const MANDATORY_TABS = ['overview', 'members'] as const;

export type OptionalTab = typeof OPTIONAL_TABS[number];

export const TAB_LABELS: Record<string, string> = {
  overview: 'Pregled',
  members: 'Tim',
  timeline: 'Timeline',
  milestones: 'Faze',
  workers: 'Radnici',
  collaborators: 'Suradnici',
  funding: 'Financiranje',
  transactions: 'Transakcije',
};

export const useProjectMemberPermissions = (projectId: string | null, userId?: string | null) => {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!projectId || !targetUserId) {
      setPermissions({});
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('project_member_permissions')
        .select('tab_key, visible')
        .eq('project_id', projectId)
        .eq('user_id', targetUserId);

      if (error) throw error;

      const perms: Record<string, boolean> = {};
      data?.forEach(row => {
        perms[row.tab_key] = row.visible;
      });
      setPermissions(perms);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, targetUserId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const updatePermissions = async (
    targetProjectId: string,
    targetUser: string,
    tabs: Record<string, boolean>
  ) => {
    try {
      const upserts = Object.entries(tabs).map(([tab_key, visible]) => ({
        project_id: targetProjectId,
        user_id: targetUser,
        tab_key,
        visible,
      }));

      const { error } = await supabase
        .from('project_member_permissions')
        .upsert(upserts, { onConflict: 'project_id,user_id,tab_key' });

      if (error) throw error;

      // Update local state if viewing same user
      if (targetUser === targetUserId) {
        const updated = { ...permissions };
        Object.entries(tabs).forEach(([k, v]) => { updated[k] = v; });
        setPermissions(updated);
      }

      return true;
    } catch (error) {
      console.error('Error updating permissions:', error);
      return false;
    }
  };

  const initDefaultPermissions = async (targetProjectId: string, targetUser: string) => {
    try {
      const defaults = OPTIONAL_TABS.map(tab_key => ({
        project_id: targetProjectId,
        user_id: targetUser,
        tab_key,
        visible: false,
      }));

      const { error } = await supabase
        .from('project_member_permissions')
        .upsert(defaults, { onConflict: 'project_id,user_id,tab_key' });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error initializing default permissions:', error);
      return false;
    }
  };

  const isTabVisible = (tabKey: string): boolean => {
    if ((MANDATORY_TABS as readonly string[]).includes(tabKey)) return true;
    return permissions[tabKey] === true;
  };

  return {
    permissions,
    loading,
    isTabVisible,
    updatePermissions,
    initDefaultPermissions,
    refetch: fetchPermissions,
  };
};
