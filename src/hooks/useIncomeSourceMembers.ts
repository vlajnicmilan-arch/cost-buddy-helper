import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { IncomeSourceMember, IncomeSourceInvitation } from '@/types/incomeSourceMember';
import { toast } from 'sonner';

export const useIncomeSourceMembers = (incomeSourceId: string | null) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<IncomeSourceMember[]>([]);
  const [invitations, setInvitations] = useState<IncomeSourceInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!incomeSourceId || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from('income_source_members')
        .select('*')
        .eq('income_source_id', incomeSourceId);

      if (membersError) throw membersError;

      // Check if current user is owner
      const currentUserMember = membersData?.find(m => m.user_id === user.id);
      setIsOwner(currentUserMember?.role === 'owner');

      // Fetch profiles for display names
      if (membersData && membersData.length > 0) {
        const userIds = membersData.map(m => m.user_id);
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);

        const membersWithNames: IncomeSourceMember[] = membersData.map(m => ({
          ...m,
          display_name: profilesData?.find(p => p.user_id === m.user_id)?.display_name || null
        }));

        setMembers(membersWithNames);
      } else {
        setMembers([]);
      }

      // Fetch pending invitations (only if owner)
      if (currentUserMember?.role === 'owner') {
        const { data: invitationsData, error: invitationsError } = await supabase
          .from('income_source_invitations')
          .select('*')
          .eq('income_source_id', incomeSourceId)
          .eq('status', 'pending');

        if (!invitationsError) {
          setInvitations(invitationsData as IncomeSourceInvitation[] || []);
        }
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Greška pri učitavanju članova');
    } finally {
      setLoading(false);
    }
  }, [incomeSourceId, user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const removeMember = async (memberId: string) => {
    if (!isOwner) {
      toast.error('Samo vlasnik može ukloniti članove');
      return;
    }

    try {
      const { error } = await supabase
        .from('income_source_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== memberId));
      toast.success('Član uklonjen iz kruga');
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Greška pri uklanjanju člana');
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    if (!isOwner) {
      toast.error('Samo vlasnik može otkazati pozivnice');
      return;
    }

    try {
      const { error } = await supabase
        .from('income_source_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(prev => prev.filter(i => i.id !== invitationId));
      toast.success('Pozivnica otkazana');
    } catch (error) {
      console.error('Error canceling invitation:', error);
      toast.error('Greška pri otkazivanju pozivnice');
    }
  };

  return {
    members,
    invitations,
    loading,
    isOwner,
    removeMember,
    cancelInvitation,
    refetch: fetchMembers
  };
};
