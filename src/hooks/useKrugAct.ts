/**
 * T8 frontend — wrapperi za approval RPC-e (A1, A2, A4, A5).
 *
 * Wave 1 SVJESNO ne pokriva A3, A6, A7. UI sloj koji troši ove hookove mora
 * jasno komunicirati da `predlozena` stanja u v1 nemaju automatski 48h expiry
 * (Wave 1.5 zatvara).
 *
 * Idempotencija ide preko `client_request_id` koji se generira po pozivu.
 * RPC dedup tablica (`krug_act_dedup`) drži ishod 24h.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

export type KrugGovernanceAct = 'A1' | 'A2' | 'A5';

export interface KrugActOutcome {
  outcome: string;
  expense_id?: string;
  krug_id?: string;
  previous_status?: string | null;
  new_status?: string | null;
  replayed?: boolean;
}

const OK_OUTCOMES = new Set([
  'ok_confirmed',
  'ok_negated',
  'ok_reproposed',
  'ok_withdrawn',
  'noop_already_in_target_state',
]);

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function reportOutcome(qc: ReturnType<typeof useQueryClient>, res: KrugActOutcome) {
  if (OK_OUTCOMES.has(res.outcome)) {
    showSuccess();
    qc.invalidateQueries({ queryKey: ['expenses'] });
  } else {
    showError(res.outcome);
  }
}

/** A1 / A2 / A5 — governance + autor-re-propose; sve kroz `krug_apply_act`. */
export function useKrugApplyAct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      expenseId: string;
      act: KrugGovernanceAct;
      /** Opcionalno; ako nije zadan, generira se novi UUID po pozivu. */
      clientRequestId?: string;
    }) => {
      const { data, error } = await supabase.rpc('krug_apply_act', {
        p_expense_id: vars.expenseId,
        p_act: vars.act,
        p_client_request_id: vars.clientRequestId ?? newRequestId(),
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as unknown as KrugActOutcome;
    },
    onSuccess: (res) => reportOutcome(qc, res),
    onError: (err: any) => showError(err?.message),
  });
}

/** A4 — autor hard-withdraw u predloženom toku; soft-delete kroz RPC. */
export function useKrugWithdraw() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { expenseId: string; clientRequestId?: string }) => {
      const { data, error } = await supabase.rpc('krug_withdraw', {
        p_expense_id: vars.expenseId,
        p_client_request_id: vars.clientRequestId ?? newRequestId(),
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as unknown as KrugActOutcome;
    },
    onSuccess: (res) => reportOutcome(qc, res),
    onError: (err: any) => showError(err?.message),
  });
}
