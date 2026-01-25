import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BudgetMember, BudgetInvitation } from '@/types/budget';
import { toast } from 'sonner';

export const useBudgetMembers = (budgetId: string | null) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<BudgetMember[]>([]);
  const [invitations, setInvitations] = useState<BudgetInvitation[]>([]);
  const [loading, setLoading] = useState(true);

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

      // Get user ids
      const userIds = (membersData || []).map(m => m.user_id);
      
      // Fetch display names
      let profiles: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);

        profilesData?.forEach(p => {
          profiles[p.user_id] = p.display_name || 'Nepoznato';
        });
      }

      const membersWithNames = (membersData || []).map(m => ({
        ...m,
        display_name: profiles[m.user_id] || 'Nepoznato'
      })) as BudgetMember[];

      setMembers(membersWithNames);

      // Fetch pending invitations
      const { data: invitationsData, error: invitationsError } = await supabase
        .from('budget_invitations')
        .select('*')
        .eq('budget_id', budgetId)
        .eq('status', 'pending');

      if (invitationsError) throw invitationsError;
      setInvitations((invitationsData || []) as BudgetInvitation[]);
    } catch (error) {
      console.error('Error fetching budget members:', error);
    } finally {
      setLoading(false);
    }
  }, [budgetId, user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const inviteMember = async (email: string, role: 'member' | 'viewer' = 'member') => {
    if (!budgetId || !user) return null;

    try {
      const { data, error } = await supabase
        .from('budget_invitations')
        .insert({
          budget_id: budgetId,
          email,
          role,
          invited_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Pozivnica poslana');
      await fetchMembers();
      return data?.token;
    } catch (error) {
      console.error('Error inviting member:', error);
      toast.error('Greška pri slanju pozivnice');
      return null;
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('budget_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      toast.success('Član uklonjen');
      await fetchMembers();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Greška pri uklanjanju člana');
    }
  };

  const updateMemberRole = async (memberId: string, role: 'member' | 'viewer') => {
    try {
      const { error } = await supabase
        .from('budget_members')
        .update({ role })
        .eq('id', memberId);

      if (error) throw error;

      toast.success('Uloga ažurirana');
      await fetchMembers();
    } catch (error) {
      console.error('Error updating member role:', error);
      toast.error('Greška pri ažuriranju uloge');
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('budget_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      toast.success('Pozivnica otkazana');
      await fetchMembers();
    } catch (error) {
      console.error('Error canceling invitation:', error);
      toast.error('Greška pri otkazivanju pozivnice');
    }
  };

  return {
    members,
    invitations,
    loading,
    inviteMember,
    removeMember,
    updateMemberRole,
    cancelInvitation,
    refetch: fetchMembers
  };
};
