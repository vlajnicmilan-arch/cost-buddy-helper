import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProjectMember, ProjectInvitation, ProjectRole } from '@/types/project';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const useProjectMembers = (projectId: string | null) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!projectId || !user) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId);

      if (membersError) throw membersError;

      // Check if current user is manager
      const currentMember = membersData?.find(m => m.user_id === user.id);
      const isCurrentManager = currentMember?.role === 'manager';
      setIsManager(isCurrentManager);

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
        role: m.role as ProjectRole,
        display_name: profilesMap.get(m.user_id) || 'Nepoznato'
      })));

      // Fetch invitations if manager
      if (isCurrentManager) {
        const { data: invitationsData } = await supabase
          .from('project_invitations')
          .select('*')
          .eq('project_id', projectId)
          .eq('status', 'pending');

        setInvitations((invitationsData || []).map(i => ({
          ...i,
          role: i.role as ProjectRole
        })));
      }
    } catch (error) {
      console.error('Error fetching project members:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const updateMemberRole = async (memberId: string, newRole: ProjectRole): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.map(m => 
        m.id === memberId ? { ...m, role: newRole } : m
      ));
      toast.success(t('projects.memberRoleUpdated'));
    } catch (error) {
      console.error('Error updating member role:', error);
      toast.error(t('common.error'));
    }
  };

  const removeMember = async (memberId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== memberId));
      toast.success(t('projects.memberRemoved'));
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error(t('common.error'));
    }
  };

  const cancelInvitation = async (invitationId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(prev => prev.filter(i => i.id !== invitationId));
      toast.success(t('projects.invitationCancelled'));
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast.error(t('common.error'));
    }
  };

  const generateInviteLink = async (role: ProjectRole = 'member'): Promise<string | null> => {
    if (!projectId || !user) return null;

    try {
      // Delete existing link invites
      await supabase
        .from('project_invitations')
        .delete()
        .eq('project_id', projectId)
        .eq('email', 'link-invite');

      // Create new invitation
      const { data, error } = await supabase
        .from('project_invitations')
        .insert({
          project_id: projectId,
          email: 'link-invite',
          role: role,
          invited_by: user.id,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
        })
        .select()
        .single();

      if (error) throw error;

      const link = `${window.location.origin}/join-project/${data.token}`;
      return link;
    } catch (error) {
      console.error('Error generating invite link:', error);
      toast.error(t('common.error'));
      return null;
    }
  };

  return {
    members,
    invitations,
    loading,
    isManager,
    updateMemberRole,
    removeMember,
    cancelInvitation,
    generateInviteLink,
    refetch: fetchMembers
  };
};
