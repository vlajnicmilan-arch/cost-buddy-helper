/**
 * Person-level payout: one typed amount -> one expense in the books +
 * one payout row per engagement (shared batch_id).
 *
 * The write itself is the existing payout machinery — RPC
 * `public.create_person_payout` delegates to `create_worker_payout` per
 * engagement, so hours locking, rate segments and voiding stay unchanged.
 * Collaborators are not part of this path.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import {
  buildPersonPayoutRpcArgs,
  type Allocation,
  type EngagementObligation,
} from '@/lib/personPayout';

export interface PersonPayoutInput {
  obligations: readonly EngagementObligation[];
  allocation: Allocation;
  paymentSource: string;
  paidAt: string;
  note?: string | null;
  lockEntries?: boolean;
  /** workers.id — diagnostics only. */
  personId?: string | null;
}

export interface PersonPayoutResult {
  batch_id: string | null;
  expense_id: string;
  payouts_count: number;
  total_paid: number;
}

export const usePersonPayout = () => {
  const [submitting, setSubmitting] = useState(false);

  const payPerson = useCallback(
    async (input: PersonPayoutInput): Promise<{ ok: true; result: PersonPayoutResult } | { ok: false; code: string | null; message: string }> => {
      const args = buildPersonPayoutRpcArgs(input);
      if (args.p_items.length === 0) {
        return { ok: false, code: 'empty_allocation', message: 'empty_allocation' };
      }
      setSubmitting(true);
      try {
        const { data, error } = await supabase.rpc('create_person_payout', args as never);
        if (error) throw error;
        const result = data as unknown as PersonPayoutResult;
        logDiagnostic({
          event: 'worker_payout_ok',
          severity: 'info',
          details: {
            person_id: input.personId ?? null,
            batch_id: result?.batch_id ?? null,
            expense_id: result?.expense_id ?? null,
            payouts_count: result?.payouts_count ?? args.p_items.length,
            total_paid: result?.total_paid ?? null,
            payment_source: input.paymentSource,
          },
        });
        return { ok: true, result };
      } catch (e: any) {
        const message = String(e?.message ?? e);
        logDiagnostic({
          event: 'worker_payout_failed',
          severity: 'error',
          details: {
            person_id: input.personId ?? null,
            items: args.p_items.length,
            payment_source: input.paymentSource,
            code: e?.code ?? null,
            message,
          },
        });
        return { ok: false, code: e?.code ?? null, message };
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { payPerson, submitting };
};
