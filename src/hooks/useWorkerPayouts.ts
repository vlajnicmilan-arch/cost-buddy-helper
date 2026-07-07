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
  batch_id: string | null;
}

export interface RateSegment {
  rate: number;
  mind: string;
  maxd: string;
  hh: number;
}

export interface PayoutPreview {
  hours: number;
  gross: number;
  segments: RateSegment[];
}

export interface CreatePayoutInput {
  workerId: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  paidAmount: number;
  paymentSource: string;
  paidAt: string;
  note?: string | null;
  lockEntries?: boolean;
}

export interface CreatePayoutResult {
  payout_id: string;
  expense_id: string;
  hours_covered: number;
  gross_amount: number;
  paid_amount: number;
  hourly_rate_snapshot?: number;
  status: PayoutStatus;
  entries_locked: number;
}

export interface BatchItemInput {
  workerId: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  paidAmount: number;
}

export interface CreateBatchInput {
  items: BatchItemInput[];
  paymentSource: string;
  paidAt: string;
  note?: string | null;
  lockEntries?: boolean;
}

export interface CreateBatchResult {
  batch_id: string;
  payouts: CreatePayoutResult[];
  payouts_count: number;
}

/**
 * Pure helper: maps our camelCase input to the SECURITY DEFINER RPC signature.
 * Exported for unit tests — must stay stable with the SQL contract in
 * supabase/migrations/20260707080136_*.sql (+ V1-B rewrite in 20260707164727_*.sql).
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

/**
 * Pure helper: maps batch input to the create_worker_payout_batch RPC.
 * Enforces the "same payment_source across batch" invariant at the client
 * boundary — the RPC only accepts a single source parameter.
 */
export function buildCreateBatchRpcArgs(input: CreateBatchInput) {
  return {
    p_items: input.items.map((i) => ({
      project_id: i.projectId,
      worker_id: i.workerId,
      period_start: i.periodStart,
      period_end: i.periodEnd,
      paid_amount: i.paidAmount,
    })),
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

  const previewPayout = async (
    workerIdArg: string,
    projectIdArg: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<PayoutPreview | null> => {
    try {
      const { data, error } = await supabase.rpc('preview_worker_payout', {
        p_worker_id: workerIdArg,
        p_project_id: projectIdArg,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });
      if (error) throw error;
      const raw = (data ?? { hours: 0, gross: 0, segments: [] }) as any;
      return {
        hours: Number(raw.hours ?? 0),
        gross: Number(raw.gross ?? 0),
        segments: (raw.segments ?? []).map((s: any) => ({
          rate: Number(s.rate),
          mind: s.mind,
          maxd: s.maxd,
          hh: Number(s.hh),
        })),
      };
    } catch (err) {
      console.error('preview_worker_payout failed:', err);
      return null;
    }
  };

  const createPayout = async (input: CreatePayoutInput): Promise<CreatePayoutResult | null> => {
    try {
      const args = buildCreatePayoutRpcArgs(input);
      const { data, error } = await supabase.rpc('create_worker_payout', args);
      if (error) throw error;
      const result = (data as unknown) as CreatePayoutResult;
      showSuccess(t('workers.payouts.createdToast', 'Isplata evidentirana'));
      await fetchPayouts();
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

  const createBatchPayout = async (input: CreateBatchInput): Promise<CreateBatchResult | null> => {
    try {
      const args = buildCreateBatchRpcArgs(input);
      const { data, error } = await supabase.rpc('create_worker_payout_batch', args as any);
      if (error) throw error;
      const result = (data as unknown) as CreateBatchResult;
      showSuccess(t('workers.payouts.batchCreatedToast', 'Zbirna isplata evidentirana'));
      await fetchPayouts();
      if (result?.batch_id) {
        supabase.functions
          .invoke('notify-worker-payout', { body: { batch_id: result.batch_id, action: 'created' } })
          .catch((e) => console.error('[useWorkerPayouts] notify batch created failed:', e));
      }
      return result;
    } catch (err: any) {
      console.error('create_worker_payout_batch failed:', err);
      const msg = err?.message || '';
      if (msg.includes('not owner of all projects')) {
        showError(t('workers.payouts.batchNotAllOwnerError', 'Nemate ovlast za sve odabrane projekte'));
      } else {
        showError(t('common.error'));
      }
      return null;
    }
  };

  /**
   * Void a payout. If the payout belongs to a batch, cascades to all sibling
   * payouts in the batch.
   */
  const voidPayout = async (payoutId: string, reason?: string): Promise<boolean> => {
    try {
      const target = payouts.find((p) => p.id === payoutId);
      const batchId = target?.batch_id ?? null;

      if (batchId) {
        const { error } = await supabase.rpc('void_worker_payout_batch', {
          p_batch_id: batchId,
          p_reason: reason ?? null,
        });
        if (error) throw error;
        showSuccess(t('workers.payouts.batchVoidedToast', 'Zbirna isplata poništena'));
        await fetchPayouts();
        supabase.functions
          .invoke('notify-worker-payout', { body: { batch_id: batchId, action: 'voided' } })
          .catch((e) => console.error('[useWorkerPayouts] notify batch voided failed:', e));
        return true;
      }

      const { error } = await supabase.rpc('void_worker_payout', {
        p_payout_id: payoutId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      showSuccess(t('workers.payouts.voidedToast', 'Isplata poništena'));
      await fetchPayouts();
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
    createBatchPayout,
    previewPayout,
    voidPayout,
    refetch: fetchPayouts,
  };
};
