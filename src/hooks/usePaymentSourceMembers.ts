import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export type PaymentSourceRole = 'owner' | 'member' | 'limited' | 'full';

export interface PaymentSourceMember {
  id: string;
  payment_source_id: string;
  user_id: string;
  role: PaymentSourceRole;
  joined_at: string;
  created_at: string;
  display_name?: string;
}

export interface PaymentSourceInvitation {
  id: string;
  payment_source_id: string;
  email: string;
  token: string;
  status: string;
  role: PaymentSourceRole;
  invited_by: string;
  expires_at: string;
  created_at: string;
}

export const PAYMENT_SOURCE_ROLE_LABELS: Record<PaymentSourceRole, string> = {
  owner: 'Vlasnik',
  member: 'Ograničeni', // legacy, treated same as limited
  limited: 'Ograničeni',
  full: 'Potpuni pristup',
};

export const usePaymentSourceMembers = (paymentSourceId: string | null) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [members, setMembers] = useState<PaymentSourceMember[]>([]);
  const [invitations, setInvitations] = useState<PaymentSourceInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!paymentSourceId || !user) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from('payment_source_members')
        .select('*')
        .eq('payment_source_id', paymentSourceId);

      if (membersError) throw membersError;

      // Check if current user is owner (via custom_payment_sources.user_id)
      const { data: sourceData } = await supabase
        .from('custom_payment_sources')
        .select('user_id')
        .eq('id', paymentSourceId)
        .single();

      const isCurrentOwner = sourceData?.user_id === user.id;
      setIsOwner(isCurrentOwner);

      // Fetch display names
      const userIds = [...(membersData?.map(m => m.user_id) || [])];
      if (sourceData?.user_id && !userIds.includes(sourceData.user_id)) {
        userIds.push(sourceData.user_id);
      }
      
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

      // Build members list - include owner as virtual member
      const allMembers: PaymentSourceMember[] = [];
      
      if (sourceData?.user_id) {
        allMembers.push({
          id: 'owner',
          payment_source_id: paymentSourceId,
          user_id: sourceData.user_id,
          role: 'owner',
          joined_at: '',
          created_at: '',
          display_name: profilesMap.get(sourceData.user_id) || 'Vlasnik',
        });
      }

      (membersData || []).forEach(m => {
        allMembers.push({
          ...m,
          role: m.role as PaymentSourceRole,
          display_name: profilesMap.get(m.user_id) || 'Nepoznato',
        });
      });

      setMembers(allMembers);

      // Fetch invitations if owner
      if (isCurrentOwner) {
        const { data: invitationsData } = await supabase
          .from('payment_source_invitations')
          .select('*')
          .eq('payment_source_id', paymentSourceId)
          .eq('status', 'pending');

        setInvitations((invitationsData || []).map(i => ({
          ...i,
          role: i.role as PaymentSourceRole,
        })));
      }
    } catch (error) {
      console.error('Error fetching payment source members:', error);
    } finally {
      setLoading(false);
    }
  }, [paymentSourceId, user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const removeMember = async (memberId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('payment_source_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== memberId));
      showSuccess(t('toasts.memberRemoved'));
    } catch (error) {
      console.error('Error removing member:', error);
      showError(t('toasts.error'));
    }
  };

  const cancelInvitation = async (invitationId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('payment_source_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(prev => prev.filter(i => i.id !== invitationId));
      showSuccess(t('toasts.invitationCancelled'));
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      showError(t('toasts.error'));
    }
  };

  const updateMemberRole = async (memberId: string, newRole: PaymentSourceRole): Promise<void> => {
    try {
      const { error } = await supabase
        .from('payment_source_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      showSuccess(t('toasts.roleUpdated'));
    } catch (error) {
      console.error('Error updating member role:', error);
      showError(t('errors.save.role', 'Greška pri ažuriranju uloge'));
    }
  };

  return {
    members,
    invitations,
    loading,
    isOwner,
    removeMember,
    updateMemberRole,
    cancelInvitation,
    refetch: fetchMembers,
  };
};
