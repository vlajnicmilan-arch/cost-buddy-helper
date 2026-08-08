/**
 * Krug — asimetrični samoizlazak člana.
 *
 * Governance pravilo: član uvijek smije sam izaći, bez ičijeg pristanka.
 * Direktan DELETE na `krug_membership` ostaje zabranjen RLS-om
 * (`krug_membership_delete_owner_not_self`), pa izlazak ide ISKLJUČIVO
 * kroz SECURITY DEFINER RPC `krug_leave`.
 *
 * Vlasnik dobiva `owner_cannot_leave` — njegov tok (prijenos vlasništva)
 * je zaseban i nije dio ove jezgre.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type KrugLeaveOutcome =
  | 'unauthorized'
  | 'krug_not_found'
  | 'owner_cannot_leave'
  | 'noop_not_member'
  | 'ok_left';

export function isKrugLeaveOk(outcome: KrugLeaveOutcome): boolean {
  return outcome === 'ok_left' || outcome === 'noop_not_member';
}

export function useKrugLeave() {
  const qc = useQueryClient();
  return useMutation<KrugLeaveOutcome, Error, { krugId: string }>({
    mutationFn: async ({ krugId }) => {
      const { data, error } = await supabase.rpc('krug_leave', { p_krug_id: krugId });
      if (error) throw error;
      const outcome = (data as { outcome?: string } | null)?.outcome;
      return (outcome as KrugLeaveOutcome) ?? 'krug_not_found';
    },
    onSuccess: (outcome, vars) => {
      if (!isKrugLeaveOk(outcome)) return;
      qc.invalidateQueries({ queryKey: ['krug', 'my'] });
      qc.invalidateQueries({ queryKey: ['krug', 'detail', vars.krugId] });
      qc.invalidateQueries({ queryKey: ['krug', 'members', vars.krugId] });
      qc.invalidateQueries({ queryKey: ['krug', 'pending-expenses', vars.krugId] });
    },
  });
}
