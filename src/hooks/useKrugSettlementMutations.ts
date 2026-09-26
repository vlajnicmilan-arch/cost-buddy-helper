/**
 * Faza B — settle ledger + void mutations.
 * RPC-only writes. Invalidira settlement, ledger i history query keys.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';
import { resolveKrugSettleErrorCode, krugSettleErrorKey } from '@/lib/krugSettleWithSource';

export interface KrugSettlementLedgerRow {
  id: string;
  krug_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  currency: string;
  note: string | null;
  marked_by: string;
  marked_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  payer_expense_id?: string | null;
  payer_source_id?: string | null;
  payer_amount?: number | null;
  payer_currency?: string | null;
  recipient_confirmed_at?: string | null;
  recipient_source_id?: string | null;
}

function reportError(err: any, fallbackKey: string, fallback: string) {
  const code = resolveKrugSettleErrorCode(err?.message);
  if (code) { showError(i18n.t(krugSettleErrorKey(code))); return; }
  // eslint-disable-next-line no-console
  console.error('[krug settle]', err);
  showError(i18n.t(fallbackKey, fallback));
}

/** Same refresh as the manual↔bank merge: balances, transactions, Tko kome, history. */
async function invalidateAfterSettleWrite(qc: QueryClient, krugId: string) {
  await Promise.allSettled([
    qc.invalidateQueries({ queryKey: ['krug', 'settlement', krugId] }),
    qc.invalidateQueries({ queryKey: ['krug', 'ledger', krugId] }),
    qc.invalidateQueries({ queryKey: ['expenses'] }),
    qc.invalidateQueries({ queryKey: ['paymentSources'] }),
    qc.invalidateQueries({ queryKey: ['customPaymentSources'] }),
    qc.invalidateQueries({ queryKey: ['balances'] }),
  ]);
  window.dispatchEvent(new CustomEvent('expenses-changed'));
}

/** Every settle-flow failure goes to app_diagnostics_logs with the literal server error. */
function logSettleError(err: any, rpc: string, ids: Record<string, string | null>) {
  logDiagnostic({
    event: 'krug_settle_error',
    severity: 'error',
    details: {
      rpc,
      ...ids,
      db_code: err?.code ?? null,
      db_message: String(err?.message ?? err),
      resolved_code: resolveKrugSettleErrorCode(err?.message),
      build: getBuildStamp(),
    },
  });
}

export interface MarkSettledWithSourceVars {
  fromUser: string;
  toUser: string;
  amount: number;
  currency: string;
  payerSourceId: string;
  clientRequestId: string;
  payerAmount?: number | null;
  note?: string;
}

/**
 * Debtor settles from a chosen source. Every failure is written to
 * app_diagnostics_logs with the literal server code/message; the user gets
 * the translated message for known codes, the generic one only otherwise.
 */
export function useKrugMarkSettledWithSource(krugId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: MarkSettledWithSourceVars) => {
      const { data, error } = await (supabase as any).rpc('krug_mark_settled_with_source', {
        p_krug_id: krugId,
        p_from_user: vars.fromUser,
        p_to_user: vars.toUser,
        p_amount: vars.amount,
        p_currency: vars.currency,
        p_payer_source_id: vars.payerSourceId,
        p_client_request_id: vars.clientRequestId,
        p_payer_amount: vars.payerAmount ?? null,
        p_note: vars.note ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; id: string; payer_expense_id: string | null; idempotent?: boolean };
    },
    onSuccess: async (data) => {
      showSuccess(i18n.t('krug.settle.success.marked', 'Podmirenje zabilježeno.'));
      await invalidateAfterSettleWrite(qc, krugId);
      return data;
    },
    onError: (err: any, vars) => {
      logSettleError(err, 'krug_mark_settled_with_source', {
        krug_id: krugId, ledger_id: null,
        source_id: vars?.payerSourceId ?? null, client_request_id: vars?.clientRequestId ?? null,
      });
      reportError(err, 'krug.settle.error.generic', 'Nije moguće spremiti podmirenje.');
    },
  });
}

export interface ConfirmReceiptVars {
  ledgerId: string;
  recipientSourceId: string;
  clientRequestId: string;
  recipientAmount?: number | null;
}

/** Recipient confirms where the money arrived (krug_confirm_settlement_receipt). */
export function useKrugConfirmSettlementReceipt(krugId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: ConfirmReceiptVars) => {
      const { data, error } = await (supabase as any).rpc('krug_confirm_settlement_receipt', {
        p_ledger_id: vars.ledgerId,
        p_recipient_source_id: vars.recipientSourceId,
        p_client_request_id: vars.clientRequestId,
        p_recipient_amount: vars.recipientAmount ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; id: string; recipient_expense_id: string | null; idempotent?: boolean };
    },
    onSuccess: async () => {
      showSuccess(i18n.t('krug.settle.success.confirmed'));
      await invalidateAfterSettleWrite(qc, krugId);
    },
    onError: (err: any, vars) => {
      logSettleError(err, 'krug_confirm_settlement_receipt', {
        krug_id: krugId, ledger_id: vars?.ledgerId ?? null,
        source_id: vars?.recipientSourceId ?? null, client_request_id: vars?.clientRequestId ?? null,
      });
      reportError(err, 'krug.settle.error.generic', 'Nije moguće spremiti podmirenje.');
    },
  });
}

export interface KrugFxSnapshot {
  rates: Record<string, number>;
  frozen_at: string;
  display_currency: string;
}

/** Latest frozen FX snapshot of the Krug — used only as a conversion hint. */
export function useLatestKrugFxSnapshot(krugId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['krug', 'fx-snapshot-latest', krugId],
    enabled: !!krugId && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<KrugFxSnapshot | null> => {
      const { data, error } = await supabase
        .from('krug_settlement_fx_snapshot' as any)
        .select('rates, frozen_at, display_currency')
        .eq('krug_id', krugId)
        .order('frozen_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });
}

export function useKrugVoidSettlement(krugId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { ledgerId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc('krug_void_settlement', {
        p_ledger_id: vars.ledgerId,
        p_reason: vars.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      showSuccess(i18n.t('krug.settle.success.voided', 'Podmirenje poništeno.'));
      qc.invalidateQueries({ queryKey: ['krug', 'settlement', krugId] });
      qc.invalidateQueries({ queryKey: ['krug', 'ledger', krugId] });
    },
    onError: (err: any, vars) => {
      logSettleError(err, 'krug_void_settlement', {
        krug_id: krugId, ledger_id: vars?.ledgerId ?? null, source_id: null, client_request_id: null,
      });
      reportError(err, 'krug.settle.error.generic', 'Nije moguće poništiti.');
    },
  });
}

export function useKrugSettlementLedger(krugId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['krug', 'ledger', krugId],
    enabled: !!krugId && enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<KrugSettlementLedgerRow[]> => {
      const { data, error } = await supabase
        .from('krug_settlement_ledger' as any)
        .select('*')
        .eq('krug_id', krugId!)
        .order('marked_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}
