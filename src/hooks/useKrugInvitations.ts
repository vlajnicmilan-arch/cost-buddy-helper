/**
 * Krug pozivnice — čitanje i odluka.
 *
 * Model pristanka:
 * - vlasnik stvara POZIVNICU (edge fn `krug-add-member`)
 * - članstvo nastaje ISKLJUČIVO kroz `krug_accept_invitation` RPC koji smije
 *   pozvati samo pozvani; `krug_membership` nema klijentsku INSERT politiku
 * - odbijanje: `krug_decline_invitation`, povlačenje (vlasnik):
 *   `krug_revoke_invitation`
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type KrugInviteRole = 'punopravni' | 'obicni';

export interface MyKrugInvitation {
  id: string;
  krug_id: string;
  krug_name: string;
  krug_preset: string | null;
  role: KrugInviteRole;
  invited_by: string;
  inviter_name: string;
  expires_at: string;
  created_at: string;
}

export interface KrugPendingInvitation {
  id: string;
  email: string;
  role: KrugInviteRole;
  invited_user_id: string | null;
  expires_at: string;
  created_at: string;
}

export type KrugInviteDecisionError =
  | 'unauthorized'
  | 'invalid_input'
  | 'not_found'
  | 'not_invitee'
  | 'not_owner'
  | 'not_pending'
  | 'expired'
  | 'cap_exceeded'
  | 'insert_failed'
  | 'unexpected';

interface RpcResult {
  ok: boolean;
  error?: KrugInviteDecisionError;
  krug_id?: string;
}

/** Pozivnice upućene prijavljenom korisniku (inbox). */
export function useMyKrugInvitations() {
  const { user } = useAuth();
  return useQuery<MyKrugInvitation[]>({
    queryKey: ['krug', 'my-invitations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('krug_list_my_invitations');
      if (error) throw error;
      return (data ?? []) as MyKrugInvitation[];
    },
  });
}

/** Pending pozivnice jednog Kruga (vidi ih vlasnik). */
export function useKrugPendingInvitations(krugId: string, enabled: boolean) {
  return useQuery<KrugPendingInvitation[]>({
    queryKey: ['krug', 'invitations', krugId],
    enabled: enabled && !!krugId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('krug_invitations')
        .select('id, email, role, invited_user_id, expires_at, created_at')
        .eq('krug_id', krugId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as KrugPendingInvitation[];
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, krugId?: string) {
  qc.invalidateQueries({ queryKey: ['krug', 'my-invitations'] });
  qc.invalidateQueries({ queryKey: ['krug', 'list'] });
  qc.invalidateQueries({ queryKey: ['krug', 'my-krugs'] });
  if (krugId) {
    qc.invalidateQueries({ queryKey: ['krug', 'invitations', krugId] });
    qc.invalidateQueries({ queryKey: ['krug', 'members', krugId] });
    qc.invalidateQueries({ queryKey: ['krug', 'detail', krugId] });
  }
}

export function useAcceptKrugInvitation() {
  const qc = useQueryClient();
  return useMutation<RpcResult, Error, { invitationId: string; krugId?: string }>({
    mutationFn: async ({ invitationId }) => {
      const { data, error } = await supabase.rpc('krug_accept_invitation', {
        p_invitation_id: invitationId,
      });
      if (error) return { ok: false, error: 'unexpected' };
      return (data ?? { ok: false, error: 'unexpected' }) as unknown as RpcResult;
    },
    onSuccess: (_res, vars) => invalidateAll(qc, vars.krugId),
  });
}

export function useDeclineKrugInvitation() {
  const qc = useQueryClient();
  return useMutation<RpcResult, Error, { invitationId: string; krugId?: string }>({
    mutationFn: async ({ invitationId }) => {
      const { data, error } = await supabase.rpc('krug_decline_invitation', {
        p_invitation_id: invitationId,
      });
      if (error) return { ok: false, error: 'unexpected' };
      return (data ?? { ok: false, error: 'unexpected' }) as unknown as RpcResult;
    },
    onSuccess: (_res, vars) => invalidateAll(qc, vars.krugId),
  });
}

export function useRevokeKrugInvitation() {
  const qc = useQueryClient();
  return useMutation<RpcResult, Error, { invitationId: string; krugId: string }>({
    mutationFn: async ({ invitationId }) => {
      const { data, error } = await supabase.rpc('krug_revoke_invitation', {
        p_invitation_id: invitationId,
      });
      if (error) return { ok: false, error: 'unexpected' };
      return (data ?? { ok: false, error: 'unexpected' }) as unknown as RpcResult;
    },
    onSuccess: (_res, vars) => invalidateAll(qc, vars.krugId),
  });
}
