/**
 * Krug — vlasnikov izlazak uz PRIJENOS VLASNIŠTVA.
 *
 * Vlasnik ne može izaći kroz `krug_leave` (serverski guard ostaje kao istina).
 * Jedini put je RPC `krug_owner_leave(p_krug_id, p_successor_id)`, koji u
 * JEDNOJ transakciji prenese vlasništvo na punopravnog člana, obriše članstvo
 * starog vlasnika i zapiše dva audit događaja. Ledger, splitovi i osobni
 * troškovi ostaju netaknuti.
 *
 * Izlazak BEZ nasljednika (nema punopravnih) nije dio ove isporuke — RPC vraća
 * `no_successor_available`, a UI to pošteno kaže (arhiviranje kruga slijedi).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type KrugOwnerLeaveOutcome =
  | 'unauthorized'
  | 'krug_not_found'
  | 'not_owner'
  | 'noop_not_owner'
  | 'successor_invalid'
  | 'successor_not_full_member'
  | 'successor_gone'
  | 'no_successor_available'
  | 'ok_transferred';

export function isKrugOwnerLeaveOk(outcome: KrugOwnerLeaveOutcome): boolean {
  return outcome === 'ok_transferred' || outcome === 'noop_not_owner';
}

export function useKrugOwnerLeave() {
  const qc = useQueryClient();
  return useMutation<
    KrugOwnerLeaveOutcome,
    Error,
    { krugId: string; successorId: string }
  >({
    mutationFn: async ({ krugId, successorId }) => {
      const { data, error } = await supabase.rpc('krug_owner_leave', {
        p_krug_id: krugId,
        p_successor_id: successorId,
      });
      if (error) throw error;
      const outcome = (data as { outcome?: string } | null)?.outcome;
      return (outcome as KrugOwnerLeaveOutcome) ?? 'krug_not_found';
    },
    onSuccess: (outcome, vars) => {
      if (!isKrugOwnerLeaveOk(outcome)) return;
      qc.invalidateQueries({ queryKey: ['krug', 'my'] });
      qc.invalidateQueries({ queryKey: ['krug', 'detail', vars.krugId] });
      qc.invalidateQueries({ queryKey: ['krug', 'members', vars.krugId] });
      qc.invalidateQueries({ queryKey: ['krug', 'pending-expenses', vars.krugId] });
    },
  });
}
