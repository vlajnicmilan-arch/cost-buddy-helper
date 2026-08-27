/**
 * Collaborator payments — read the ledger, write only through RPCs.
 *
 * `create_collaborator_payment` / `void_collaborator_payment` own every write
 * (expense, ledger row, recomputed paid_amount). This hook fetches the rows the
 * card needs and reports every failure into app_diagnostics_logs.
 *
 * The hourly-work path (project_workers / project_worker_payouts) is never
 * touched here.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';
import type { CollaboratorPaymentRow } from '@/lib/collaboratorPayment';

export interface CreateCollaboratorPaymentInput {
  collaboratorId: string;
  projectId: string;
  amount: number;
  paymentSource: string;
  paidAt: string;
  note?: string | null;
}

export interface RpcFailure {
  ok: false;
  code: string | null;
  message: string;
}

const failure = (e: any): RpcFailure => ({
  ok: false,
  code: e?.code ?? null,
  message: String(e?.message ?? e),
});

export const useCollaboratorPayments = (collaboratorIds: readonly string[]) => {
  const [payments, setPayments] = useState<CollaboratorPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const key = [...collaboratorIds].sort().join(',');

  const fetchPayments = useCallback(async () => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setPayments([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase.from('project_collaborator_payments') as any)
        .select('id, collaborator_id, project_id, amount, paid_at, payment_source, note, expense_id, status, void_reason, voided_at, deleted_at')
        .in('collaborator_id', ids)
        .is('deleted_at', null)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      setPayments(
        (data ?? []).map((p: any) => ({
          ...p,
          amount: Number(p.amount) || 0,
        })),
      );
    } catch (e: any) {
      logDiagnostic({
        event: 'collaborator_payment_fetch_failed',
        severity: 'error',
        details: { db_code: e?.code ?? null, db_message: String(e?.message ?? e), build: getBuildStamp() },
      });
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const createPayment = useCallback(
    async (input: CreateCollaboratorPaymentInput): Promise<{ ok: true; result: any } | RpcFailure> => {
      setSubmitting(true);
      try {
        const { data, error } = await supabase.rpc('create_collaborator_payment', {
          p_collaborator_id: input.collaboratorId,
          p_amount: input.amount,
          p_payment_source: input.paymentSource,
          p_paid_at: input.paidAt,
          p_note: input.note ?? null,
        } as never);
        if (error) throw error;
        logDiagnostic({
          event: 'collaborator_payment_ok',
          severity: 'info',
          details: {
            collaborator_id: input.collaboratorId,
            project_id: input.projectId,
            amount: input.amount,
            payment_source: input.paymentSource,
            build: getBuildStamp(),
          },
        });
        await fetchPayments();
        return { ok: true, result: data };
      } catch (e: any) {
        logDiagnostic({
          event: 'collaborator_payment_failed',
          severity: 'error',
          details: {
            db_code: e?.code ?? null,
            db_message: String(e?.message ?? e),
            collaborator_id: input.collaboratorId,
            project_id: input.projectId,
            amount: input.amount,
            payment_source: input.paymentSource,
            build: getBuildStamp(),
          },
        });
        return failure(e);
      } finally {
        setSubmitting(false);
      }
    },
    [fetchPayments],
  );

  const voidPayment = useCallback(
    async (payment: CollaboratorPaymentRow, reason: string): Promise<{ ok: true } | RpcFailure> => {
      setSubmitting(true);
      try {
        const { error } = await supabase.rpc('void_collaborator_payment', {
          p_payment_id: payment.id,
          p_reason: reason,
        } as never);
        if (error) throw error;
        logDiagnostic({
          event: 'collaborator_payment_void_ok',
          severity: 'info',
          details: {
            collaborator_id: payment.collaborator_id,
            project_id: payment.project_id,
            amount: payment.amount,
            payment_source: payment.payment_source,
            build: getBuildStamp(),
          },
        });
        await fetchPayments();
        return { ok: true };
      } catch (e: any) {
        logDiagnostic({
          event: 'collaborator_payment_void_failed',
          severity: 'error',
          details: {
            db_code: e?.code ?? null,
            db_message: String(e?.message ?? e),
            collaborator_id: payment.collaborator_id,
            project_id: payment.project_id,
            amount: payment.amount,
            payment_source: payment.payment_source,
            build: getBuildStamp(),
          },
        });
        return failure(e);
      } finally {
        setSubmitting(false);
      }
    },
    [fetchPayments],
  );

  return { payments, loading, submitting, refetch: fetchPayments, createPayment, voidPayment };
};
