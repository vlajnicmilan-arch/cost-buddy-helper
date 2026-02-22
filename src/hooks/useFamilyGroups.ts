import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { FamilyGroup, FamilyMember, FamilyInvitation, FamilyRole, FamilySharedSource, FamilySharedBudget, FamilySharedProject } from '@/types/family';
import { toast } from 'sonner';

export const useFamilyGroups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('family_groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGroups(data || []);
    } catch (error) {
      console.error('Error fetching family groups:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = async (data: { name: string; icon?: string; color?: string }) => {
    if (!user) return null;

    try {
      const { data: created, error } = await supabase
        .from('family_groups')
        .insert({
          user_id: user.id,
          name: data.name,
          icon: data.icon || '👨‍👩‍👧‍👦',
          color: data.color || '#3b82f6'
        })
        .select()
        .single();

      if (error) throw error;
      
      setGroups(prev => [created, ...prev]);
      toast.success('Grupa kreirana!');
      return created;
    } catch (error) {
      console.error('Error creating family group:', error);
      toast.error('Greška pri kreiranju grupe');
      return null;
    }
  };

  const updateGroup = async (id: string, data: Partial<FamilyGroup>) => {
    try {
      const { error } = await supabase
        .from('family_groups')
        .update({ name: data.name, icon: data.icon, color: data.color })
        .eq('id', id);

      if (error) throw error;

      setGroups(prev => prev.map(g => g.id === id ? { ...g, ...data } : g));
      toast.success('Grupa ažurirana');
    } catch (error) {
      console.error('Error updating family group:', error);
      toast.error('Greška');
    }
  };

  const deleteGroup = async (id: string) => {
    try {
      const { error } = await supabase
        .from('family_groups')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setGroups(prev => prev.filter(g => g.id !== id));
      toast.success('Grupa obrisana');
    } catch (error) {
      console.error('Error deleting family group:', error);
      toast.error('Greška');
    }
  };

  return {
    groups,
    loading,
    createGroup,
    updateGroup,
    deleteGroup,
    refetch: fetchGroups
  };
};

export const useFamilyMembers = (groupId: string | null) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!groupId || !user) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: membersData, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('group_id', groupId);

      if (error) throw error;

      const currentMember = membersData?.find(m => m.user_id === user.id);
      const isCurrentOwner = currentMember?.role === 'owner';
      setIsOwner(isCurrentOwner);

      // Fetch display names
      const userIds = membersData?.map(m => m.user_id) || [];
      let profilesMap = new Map<string, string>();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);

        profiles?.forEach(p => {
          profilesMap.set(p.user_id, p.display_name || 'Nepoznato');
        });
      }

      setMembers((membersData || []).map(m => ({
        ...m,
        role: m.role as FamilyRole,
        display_name: profilesMap.get(m.user_id) || 'Nepoznato'
      })));

      if (isCurrentOwner) {
        const { data: invData } = await supabase
          .from('family_invitations')
          .select('*')
          .eq('group_id', groupId)
          .eq('status', 'pending');

        setInvitations((invData || []).map(i => ({
          ...i,
          role: i.role as FamilyRole
        })));
      }
    } catch (error) {
      console.error('Error fetching family members:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const updateMemberRole = async (memberId: string, newRole: FamilyRole) => {
    try {
      const { error } = await supabase
        .from('family_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, role: newRole } : m
      ));
      toast.success('Uloga ažurirana');
    } catch (error) {
      console.error('Error updating member role:', error);
      toast.error('Greška');
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('family_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== memberId));
      toast.success('Član uklonjen');
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Greška');
    }
  };

  const generateInviteLink = async (role: FamilyRole = 'member'): Promise<string | null> => {
    if (!groupId || !user) return null;

    try {
      await supabase
        .from('family_invitations')
        .delete()
        .eq('group_id', groupId)
        .eq('email', 'link-invite');

      const { data, error } = await supabase
        .from('family_invitations')
        .insert({
          group_id: groupId,
          email: 'link-invite',
          role,
          invited_by: user.id,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return `${window.location.origin}/join-family/${data.token}`;
    } catch (error) {
      console.error('Error generating invite link:', error);
      toast.error('Greška');
      return null;
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('family_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(prev => prev.filter(i => i.id !== invitationId));
      toast.success('Pozivnica otkazana');
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast.error('Greška');
    }
  };

  return {
    members,
    invitations,
    loading,
    isOwner,
    updateMemberRole,
    removeMember,
    generateInviteLink,
    cancelInvitation,
    refetch: fetchMembers
  };
};

export const useFamilySharedResources = (groupId: string | null) => {
  const { user } = useAuth();
  const [sharedSources, setSharedSources] = useState<FamilySharedSource[]>([]);
  const [sharedBudgets, setSharedBudgets] = useState<FamilySharedBudget[]>([]);
  const [sharedProjects, setSharedProjects] = useState<FamilySharedProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResources = useCallback(async () => {
    if (!groupId || !user) {
      setSharedSources([]);
      setSharedBudgets([]);
      setSharedProjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch shared sources
      const { data: sourcesData, error: sourcesError } = await supabase
        .from('family_shared_sources')
        .select('*')
        .eq('group_id', groupId);

      if (sourcesError) throw sourcesError;

      // Fetch source details
      if (sourcesData && sourcesData.length > 0) {
        const sourceIds = sourcesData.map(s => s.payment_source_id);
        const { data: sourceDetails } = await supabase
          .from('custom_payment_sources')
          .select('id, name, icon, color, balance')
          .in('id', sourceIds);

        const detailsMap = new Map(sourceDetails?.map(d => [d.id, d]) || []);
        setSharedSources(sourcesData.map(s => {
          const detail = detailsMap.get(s.payment_source_id);
          return {
            ...s,
            source_name: detail?.name,
            source_icon: detail?.icon,
            source_color: detail?.color,
            source_balance: detail?.balance
          };
        }));
      } else {
        setSharedSources([]);
      }

      // Fetch shared budgets
      const { data: budgetsData, error: budgetsError } = await supabase
        .from('family_shared_budgets')
        .select('*')
        .eq('group_id', groupId);

      if (budgetsError) throw budgetsError;

      if (budgetsData && budgetsData.length > 0) {
        const budgetIds = budgetsData.map(b => b.budget_id);
        const { data: budgetDetails } = await supabase
          .from('budget_plans')
          .select('id, name, icon, color, total_amount')
          .in('id', budgetIds);

        const detailsMap = new Map(budgetDetails?.map(d => [d.id, d]) || []);
        setSharedBudgets(budgetsData.map(b => {
          const detail = detailsMap.get(b.budget_id);
          return {
            ...b,
            budget_name: detail?.name,
            budget_icon: detail?.icon,
            budget_color: detail?.color,
            budget_total: detail?.total_amount
          };
        }));
      } else {
        setSharedBudgets([]);
      }

      // Fetch shared projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('family_shared_projects' as any)
        .select('*')
        .eq('group_id', groupId);

      if (projectsError) throw projectsError;

      if (projectsData && projectsData.length > 0) {
        const projectIds = (projectsData as any[]).map(p => p.project_id);
        const { data: projectDetails } = await supabase
          .from('projects')
          .select('id, name, icon, color, status, total_budget')
          .in('id', projectIds);

        const detailsMap = new Map(projectDetails?.map(d => [d.id, d]) || []);
        setSharedProjects((projectsData as any[]).map(p => {
          const detail = detailsMap.get(p.project_id);
          return {
            ...p,
            project_name: detail?.name,
            project_icon: detail?.icon,
            project_color: detail?.color,
            project_status: detail?.status,
            project_total_budget: detail?.total_budget
          };
        }));
      } else {
        setSharedProjects([]);
      }
    } catch (error) {
      console.error('Error fetching shared resources:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, user]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const logActivity = async (actionType: string, description: string, metadata: Record<string, any> = {}) => {
    if (!groupId || !user) return;
    try {
      await supabase
        .from('family_activity_log' as any)
        .insert({
          group_id: groupId,
          user_id: user.id,
          action_type: actionType,
          action_description: description,
          metadata
        });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const addSharedSource = async (paymentSourceId: string) => {
    if (!groupId || !user) return;

    try {
      const { error } = await supabase
        .from('family_shared_sources')
        .insert({
          group_id: groupId,
          payment_source_id: paymentSourceId,
          added_by: user.id
        });

      if (error) throw error;
      toast.success('Račun dodan u grupu');
      await logActivity('added_source', 'Dodao/la račun u grupu', { payment_source_id: paymentSourceId });
      fetchResources();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('Račun je već dodan u grupu');
      } else {
        console.error('Error adding shared source:', error);
        toast.error('Greška');
      }
    }
  };

  const removeSharedSource = async (id: string) => {
    try {
      const { error } = await supabase
        .from('family_shared_sources')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSharedSources(prev => prev.filter(s => s.id !== id));
      toast.success('Račun uklonjen iz grupe');
      await logActivity('removed_source', 'Uklonio/la račun iz grupe');
    } catch (error) {
      console.error('Error removing shared source:', error);
      toast.error('Greška');
    }
  };

  const addSharedBudget = async (budgetId: string) => {
    if (!groupId || !user) return;

    try {
      const { error } = await supabase
        .from('family_shared_budgets')
        .insert({
          group_id: groupId,
          budget_id: budgetId,
          added_by: user.id
        });

      if (error) throw error;
      toast.success('Budžet dodan u grupu');
      await logActivity('added_budget', 'Dodao/la budžet u grupu', { budget_id: budgetId });
      fetchResources();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('Budžet je već dodan u grupu');
      } else {
        console.error('Error adding shared budget:', error);
        toast.error('Greška');
      }
    }
  };

  const removeSharedBudget = async (id: string) => {
    try {
      const { error } = await supabase
        .from('family_shared_budgets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSharedBudgets(prev => prev.filter(b => b.id !== id));
      toast.success('Budžet uklonjen iz grupe');
      await logActivity('removed_budget', 'Uklonio/la budžet iz grupe');
    } catch (error) {
      console.error('Error removing shared budget:', error);
      toast.error('Greška');
    }
  };

  const addSharedProject = async (projectId: string) => {
    if (!groupId || !user) return;

    try {
      const { error } = await supabase
        .from('family_shared_projects' as any)
        .insert({
          group_id: groupId,
          project_id: projectId,
          added_by: user.id
        });

      if (error) throw error;
      toast.success('Projekt dodan u grupu');
      await logActivity('added_project', 'Dodao/la projekt u grupu', { project_id: projectId });
      fetchResources();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('Projekt je već dodan u grupu');
      } else {
        console.error('Error adding shared project:', error);
        toast.error('Greška');
      }
    }
  };

  const removeSharedProject = async (id: string) => {
    try {
      const { error } = await supabase
        .from('family_shared_projects' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSharedProjects(prev => prev.filter(p => p.id !== id));
      toast.success('Projekt uklonjen iz grupe');
      await logActivity('removed_project', 'Uklonio/la projekt iz grupe');
    } catch (error) {
      console.error('Error removing shared project:', error);
      toast.error('Greška');
    }
  };

  return {
    sharedSources,
    sharedBudgets,
    sharedProjects,
    loading,
    addSharedSource,
    removeSharedSource,
    addSharedBudget,
    removeSharedBudget,
    addSharedProject,
    removeSharedProject,
    logActivity,
    refetch: fetchResources
  };
};

// Activity feed hook
export interface FamilyActivity {
  id: string;
  group_id: string;
  user_id: string;
  action_type: string;
  action_description: string;
  metadata: Record<string, any>;
  created_at: string;
  display_name?: string;
}

export const useFamilyActivity = (groupId: string | null) => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<FamilyActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    if (!groupId || !user) {
      setActivities([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('family_activity_log' as any)
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const items = (data || []) as any[];
      
      // Fetch display names
      const userIds = [...new Set(items.map(a => a.user_id))];
      let profilesMap = new Map<string, string>();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);

        profiles?.forEach(p => {
          profilesMap.set(p.user_id, p.display_name || 'Nepoznato');
        });
      }

      setActivities(items.map(a => ({
        ...a,
        display_name: profilesMap.get(a.user_id) || 'Nepoznato'
      })));
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, user]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  return { activities, loading, refetch: fetchActivities };
};
