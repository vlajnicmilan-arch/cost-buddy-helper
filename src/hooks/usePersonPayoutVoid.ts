/**
 * Voiding a payout from the person card ("Ljudi").
 *
 * No new logic: this calls the EXISTING database functions
 * `void_worker_payout` (single payout) and `void_worker_payout_batch`
 * (when the row belongs to a batch). Expense removal, hour unlocking and
 * balance effects stay entirely in those functions.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';

export interface VoidPersonPayoutInput {
  payoutId: string;
  batchId?: string | null;
  reason: string;
  /** workers.id — diagnostics only. */
  personId?: string | null;
  amount?: number | null;
}

export const usePersonPayoutVoid = () => {
  const [voiding, setVoiding] = useState(false);

  const voidPayout = useCallback(
    async (
      input: VoidPersonPayoutInput,
    ): Promise<{ ok: true } | { ok: false; code: string | null; message: string }> => {
      setVoiding(true);
      try {
        const { error } = input.batchId
          ? await supabase.rpc('void_worker_payout_batch', {
              p_batch_id: input.batchId,
              p_reason: input.reason,
            })
          : await supabase.rpc('void_worker_payout', {
              p_payout_id: input.payoutId,
              p_reason: input.reason,
            });
        if (error) throw error;

        supabase.functions
          .invoke('notify-worker-payout', {
            body: input.batchId
              ? { batch_id: input.batchId, action: 'voided' }
              : { payout_id: input.payoutId, action: 'voided' },
          })
          .catch(() => undefined);

        return { ok: true };
      } catch (e: any) {
        const message = String(e?.message ?? e);
        logDiagnostic({
          event: 'worker_payout_void_failed',
          severity: 'error',
          details: {
            person_id: input.personId ?? null,
            payout_id: input.payoutId,
            batch_id: input.batchId ?? null,
            amount: input.amount ?? null,
            reason: input.reason,
            code: e?.code ?? null,
            db_message: message,
          },
        });
        return { ok: false, code: e?.code ?? null, message };
      } finally {
        setVoiding(false);
      }
    },
    [],
  );

  return { voidPayout, voiding };
};
