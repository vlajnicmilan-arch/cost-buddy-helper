import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export type PayoutStatus = 'paid' | 'partial' | 'advance' | 'voided';

export interface WorkerPayout {
  id: string;
  project_id: string;
  worker_id: string;
  expense_id: string | null;
  period_start: string;
  period_end: string;
  hours_covered: number;
  hourly_rate_snapshot: number;
  gross_amount: number;
  paid_amount: number;
  payment_source: string | null;
  paid_at: string;
  note: string | null;
  status: PayoutStatus;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface CreatePayoutInput {
  workerId: string;
  projectId: string;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;     // YYYY-MM-DD
  paidAmount: number;
  paymentSource: string;
  paidAt: string;        // ISO
  note?: string | null;
  lockEntries?: boolean;
}

export interface CreatePayoutResult {
  payout_id: string;
  expense_id: string;
  hours_covered: number;
  gross_amount: number;
  paid_amount: number;
  status: PayoutStatus;
  entries_locked: number;
}

/**
 * Pure helper: maps our camelCase input to the SECURITY DEFINER RPC signature.
 * Exported for unit tests — must stay stable with the SQL contract in
 * supabase/migrations/20260707080136_*.sql.
 */
export function buildCreatePayoutRpcArgs(input: CreatePayoutInput) {
  return {
    p_worker_id: input.workerId,
    p_project_id: input.projectId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_paid_amount: input.paidAmount,
    p_payment_source: input.paymentSource,
    p_paid_at: input.paidAt,
    p_note: input.note ?? null,
    p_lock_entries: input.lockEntries ?? true,
  };
}

export const useWorkerPayouts = (projectId: string | null, workerId: string | null) => {
  const { t } = useTranslation();
  const [payouts, setPayouts] = useState<WorkerPayout[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayouts = useCallback(async () => {
    if (!projectId || !workerId) {
      setPayouts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_worker_payouts')
        .select('*')
        .eq('project_id', projectId)
        .eq('worker_id', workerId)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      setPayouts(((data ?? []) as unknown) as WorkerPayout[]);
    } catch (err) {
      console.error('Error fetching worker payouts:', err);
      showError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [projectId, workerId, t]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  const createPayout = async (input: CreatePayoutInput): Promise<CreatePayoutResult | null> => {
    try {
      const args = buildCreatePayoutRpcArgs(input);
      const { data, error } = await supabase.rpc('create_worker_payout', args);
      if (error) throw error;
      const result = (data as unknown) as CreatePayoutResult;
      showSuccess(t('workers.payouts.createdToast', 'Isplata evidentirana'));
      await fetchPayouts();
      // Fire-and-forget: notify linked worker (bell + push).
      if (result?.payout_id) {
        supabase.functions
          .invoke('notify-worker-payout', { body: { payout_id: result.payout_id, action: 'created' } })
          .catch((e) => console.error('[useWorkerPayouts] notify-worker-payout created failed:', e));
      }
      return result;
    } catch (err: any) {
      console.error('create_worker_payout failed:', err);
      const msg = err?.message || '';
      if (msg.includes('not project owner')) {
        showError(t('projects.access.readOnlyBlockedToast'));
      } else {
        showError(t('common.error'));
      }
      return null;
    }
  };

  const voidPayout = async (payoutId: string, reason?: string): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc('void_worker_payout', {
        p_payout_id: payoutId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      showSuccess(t('workers.payouts.voidedToast', 'Isplata poništena'));
      await fetchPayouts();
      // Fire-and-forget: notify linked worker (bell + push).
      supabase.functions
        .invoke('notify-worker-payout', { body: { payout_id: payoutId, action: 'voided' } })
        .catch((e) => console.error('[useWorkerPayouts] notify-worker-payout voided failed:', e));
      return true;
    } catch (err) {
      console.error('void_worker_payout failed:', err);
      showError(t('common.error'));
      return false;
    }
  };

  return {
    payouts,
    loading,
    createPayout,
    voidPayout,
    refetch: fetchPayouts,
  };
};
