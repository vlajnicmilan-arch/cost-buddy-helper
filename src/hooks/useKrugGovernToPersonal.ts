/**
 * Wave 1.5 — A7 governance wrapper.
 *
 * Punopravni član kruga može potvrdjena/nepotvrdjena shared trošak
 * vratiti na personal (zadržava krug_id; krug_id→NULL je post-delete put,
 * NIJE A7). Ne djeluje na `predlozena` (to je A3 za autora).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { friendlyError, tr } from '@/lib/errorMessages';

export interface KrugGovernOutcome {
  outcome: string;
  expense_id?: string;
  krug_id?: string;
  replayed?: boolean;
}

const OK = new Set(['ok_governed_to_personal', 'noop_already_in_target_state']);

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useKrugGovernToPersonal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { expenseId: string; clientRequestId?: string }) => {
      const { data, error } = await (supabase.rpc as any)('krug_govern_to_personal', {
        p_expense_id: vars.expenseId,
        p_client_request_id: vars.clientRequestId ?? newRequestId(),
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as KrugGovernOutcome;
    },
    onSuccess: (res) => {
      if (OK.has(res.outcome)) {
        showSuccess();
        qc.invalidateQueries({ queryKey: ['expenses'] });
        // Parity s useKrugApplyAct: A7 miče red iz approval queue-a
        // (potvrdjena/nepotvrdjena → personal), pa queue mora znati odmah.
        qc.invalidateQueries({ queryKey: ['krug', 'pending-expenses'] });
      } else {
        showError(tr(`krug.act.error.${res.outcome}`, 'Akcija nije dopuštena.'));
      }
    },
    onError: (err: any) => showError(friendlyError(err, 'krug.act.error.network', 'Akcija trenutno nije moguća. Pokušaj ponovno.')),
  });
}
