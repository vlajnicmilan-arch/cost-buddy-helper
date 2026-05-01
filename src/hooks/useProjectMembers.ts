import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProjectMember, ProjectInvitation, ProjectRole } from '@/types/project';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
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
        member_context: ((m as any).member_context === 'business' ? 'business' : 'personal') as 'personal' | 'business',
        member_business_profile_id: (m as any).member_business_profile_id ?? null,
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
      showSuccess(t('projects.memberRoleUpdated'));
    } catch (error) {
      console.error('Error updating member role:', error);
      showError(t('common.error'));
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
      showSuccess(t('projects.memberRemoved'));
    } catch (error) {
      console.error('Error removing member:', error);
      showError(t('common.error'));
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
      showSuccess(t('projects.invitationCancelled'));
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      showError(t('common.error'));
    }
  };

  const generateInviteLink = async (
    role: ProjectRole = 'member',
    suggestedContext: 'personal' | 'business' = 'personal',
    defaultPermissions?: Record<string, boolean>,
    workerId?: string | null
  ): Promise<string | null> => {
    if (!projectId || !user) return null;

    try {
      // Delete existing link invites (scoped: per-worker if workerId, else generic)
      const delQuery = supabase
        .from('project_invitations')
        .delete()
        .eq('project_id', projectId)
        .eq('email', workerId ? `worker-invite:${workerId}` : 'link-invite');
      await delQuery;

      // Create new invitation
      const insertPayload: Record<string, unknown> = {
        project_id: projectId,
        email: workerId ? `worker-invite:${workerId}` : 'link-invite',
        role: role,
        invited_by: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7d for worker invites
        suggested_context: suggestedContext,
      };
      if (defaultPermissions && Object.keys(defaultPermissions).length > 0) {
        insertPayload.default_permissions = defaultPermissions;
      }
      if (workerId) {
        insertPayload.worker_id = workerId;
      }

      const { data, error } = await supabase
        .from('project_invitations')
        .insert(insertPayload as any)
        .select()
        .single();

      if (error) throw error;

      const link = `${window.location.origin}/join-project/${data.token}`;
      return link;
    } catch (error) {
      console.error('Error generating invite link:', error);
      showError(t('common.error'));
      return null;
    }
  };

  /**
   * Send a worker/member invitation by email.
   * Works for both existing app users (in-app + push + email) and brand-new users (email only).
   * Returns { success, mode } so the UI can show appropriate feedback.
   */
  const sendInviteEmail = async (
    email: string,
    role: ProjectRole = 'member',
    workerId?: string | null,
    suggestedContext: 'personal' | 'business' = 'personal'
  ): Promise<{ success: boolean; mode?: 'in_system' | 'email_only'; error?: string }> => {
    if (!projectId || !user) return { success: false, error: 'no_session' };

    try {
      const { data, error } = await supabase.functions.invoke('send-member-invitation', {
        body: {
          type: 'project',
          targetId: projectId,
          invitedEmail: email.trim().toLowerCase(),
          role,
          suggestedContext,
          workerId: workerId ?? undefined,
          sendEmail: true,
        },
      });

      if (error) {
        const errBody = (error as any)?.context?.body
          ? (() => { try { return JSON.parse((error as any).context.body); } catch { return null; } })()
          : null;
        const code = errBody?.error || (error as any)?.message || 'unknown';
        return { success: false, error: code };
      }

      const code = (data as any)?.error;
      if (code) return { success: false, error: code };

      return { success: true, mode: (data as any)?.mode };
    } catch (e) {
      console.error('Error sending invite email:', e);
      return { success: false, error: 'unknown' };
    }
  };

  /**
   * Allow the current member to relocate the project on their side
   * (Personal vs a specific Business profile of theirs).
   * Updates the member's own row only — RLS enforces this.
   */
  const updateMemberContext = async (
    memberContext: 'personal' | 'business',
    businessProfileId: string | null
  ): Promise<boolean> => {
    if (!projectId || !user) return false;

    try {
      const { error } = await supabase
        .from('project_members')
        .update({
          member_context: memberContext,
          member_business_profile_id: memberContext === 'business' ? businessProfileId : null,
        } as any)
        .eq('project_id', projectId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local cache
      setMembers(prev => prev.map(m =>
        m.user_id === user.id
          ? { ...m, member_context: memberContext, member_business_profile_id: memberContext === 'business' ? businessProfileId : null }
          : m
      ));

      showSuccess(t('projects.contextUpdated', 'Lokacija projekta ažurirana'));
      return true;
    } catch (error) {
      console.error('Error updating member context:', error);
      showError(t('common.error'));
      return false;
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
    sendInviteEmail,
    updateMemberContext,
    refetch: fetchMembers
  };
};
