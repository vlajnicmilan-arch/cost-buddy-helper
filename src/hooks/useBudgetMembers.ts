import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BudgetMember, BudgetInvitation, BudgetRole } from '@/types/budgetMember';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export const useBudgetMembers = (budgetId: string | null) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [members, setMembers] = useState<BudgetMember[]>([]);
  const [invitations, setInvitations] = useState<BudgetInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!budgetId || !user) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from('budget_members')
        .select('*')
        .eq('budget_id', budgetId);

      if (membersError) throw membersError;

      // Check if current user is owner
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
        role: m.role as BudgetRole,
        display_name: profilesMap.get(m.user_id) || 'Nepoznato'
      })));

      // Fetch invitations if owner
      if (isCurrentOwner) {
        const { data: invitationsData } = await supabase
          .from('budget_invitations')
          .select('*')
          .eq('budget_id', budgetId)
          .eq('status', 'pending');

        setInvitations((invitationsData || []).map(i => ({
          ...i,
          role: i.role as BudgetRole
        })));
      }
    } catch (error) {
      console.error('Error fetching budget members:', error);
    } finally {
      setLoading(false);
    }
  }, [budgetId, user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const updateMemberRole = async (memberId: string, newRole: BudgetRole): Promise<void> => {
    try {
      const { error } = await supabase
        .from('budget_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.map(m => 
        m.id === memberId ? { ...m, role: newRole } : m
      ));
      showSuccess(t('budget.memberRoleUpdated', 'Uloga člana ažurirana'));
    } catch (error) {
      console.error('Error updating member role:', error);
      showError(t('common.error', t('toasts.error')));
    }
  };

  const removeMember = async (memberId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('budget_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== memberId));
      showSuccess(t('budget.memberRemoved', 'Član uklonjen'));
    } catch (error) {
      console.error('Error removing member:', error);
      showError(t('common.error', t('toasts.error')));
    }
  };

  const cancelInvitation = async (invitationId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('budget_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(prev => prev.filter(i => i.id !== invitationId));
      showSuccess(t('budget.invitationCancelled', 'Pozivnica otkazana'));
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      showError(t('common.error', t('toasts.error')));
    }
  };

  const generateInviteLink = async (role: BudgetRole = 'member'): Promise<string | null> => {
    if (!budgetId || !user) return null;

    try {
      // Delete existing link invites
      await supabase
        .from('budget_invitations')
        .delete()
        .eq('budget_id', budgetId)
        .eq('email', 'link-invite');

      // Create new invitation
      const { data, error } = await supabase
        .from('budget_invitations')
        .insert({
          budget_id: budgetId,
          email: 'link-invite',
          role: role,
          invited_by: user.id,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
        })
        .select()
        .single();

      if (error) throw error;

      const link = `${window.location.origin}/join-budget/${data.token}`;
      return link;
    } catch (error) {
      console.error('Error generating invite link:', error);
      showError(t('common.error', t('toasts.error')));
      return null;
    }
  };

  return {
    members,
    invitations,
    loading,
    isOwner,
    updateMemberRole,
    removeMember,
    cancelInvitation,
    generateInviteLink,
    refetch: fetchMembers
  };
};
