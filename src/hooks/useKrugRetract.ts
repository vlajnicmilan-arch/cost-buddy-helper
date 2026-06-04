/**
 * Wave 1.5 — A3 retraction wrapper.
 *
 * Autor (mora biti i punopravni član) vlastiti shared+predlozena trošak
 * vraća na personal; krug_id ostaje, krug_shared_status briše.
 * Saldo ostaje netaknut jer expense ostaje živ.
 *
 * Idempotencija ide preko `client_request_id`; RPC dedup tablica drži ishod 24h.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

export interface KrugRetractOutcome {
  outcome: string;
  expense_id?: string;
  krug_id?: string;
  replayed?: boolean;
}

const OK = new Set(['ok_retracted', 'noop_already_in_target_state']);

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useKrugRetract() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { expenseId: string; clientRequestId?: string }) => {
      const { data, error } = await (supabase.rpc as any)('krug_retract', {
        p_expense_id: vars.expenseId,
        p_client_request_id: vars.clientRequestId ?? newRequestId(),
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as KrugRetractOutcome;
    },
    onSuccess: (res) => {
      if (OK.has(res.outcome)) {
        showSuccess();
        qc.invalidateQueries({ queryKey: ['expenses'] });
      } else {
        showError(res.outcome);
      }
    },
    onError: (err: any) => showError(err?.message),
  });
}
