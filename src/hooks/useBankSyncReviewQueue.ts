import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { applyCountedFilter } from '@/lib/countedExpense';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  logReviewDecision,
  logReviewDecisionError,
  planReviewDecision,
  type ReviewCandidate,
  type ReviewChoice,
  type ReviewQueueItem,
} from '@/lib/bankSyncReview/decision';

export const BANK_SYNC_REVIEW_KEY = 'bankSyncReview';

export interface ReviewQueueData {
  items: ReviewQueueItem[];
  candidates: Record<string, ReviewCandidate>;
}

/** Retci koji čekaju odluku (samo vlastiti — RLS). */
export function useBankSyncReviewQueue(bankAccountId?: string | null) {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: [BANK_SYNC_REVIEW_KEY, 'list', user?.id, bankAccountId ?? null],
    enabled: !!user?.id,
    queryFn: async (): Promise<ReviewQueueData> => {
      let q = supabase
        .from('bank_sync_review_queue')
        .select('id, user_id, bank_account_id, stable_id, reason, candidate_ids, payload, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (bankAccountId) q = q.eq('bank_account_id', bankAccountId);
      const { data, error } = await q;
      if (error) throw error;
      const items = (data ?? []) as unknown as ReviewQueueItem[];
      const ids = [...new Set(items.flatMap((i) => i.candidate_ids ?? []))];
      const candidates: Record<string, ReviewCandidate> = {};
      if (ids.length > 0) {
        const { data: rows, error: cErr } = await applyCountedFilter(
          supabase.from('expenses').select('id, user_id, amount, date, description, payment_source'),
        )
          .in('id', ids)
          .is('deleted_at', null)
          .is('bank_transaction_id', null);
        if (cErr) throw cErr;
        for (const r of rows ?? []) candidates[r.id] = r as ReviewCandidate;
      }
      return { items, candidates };
    },
  });
}

/** Broj redaka na čekanju po bankovnom računu. */
export function useBankSyncReviewCounts() {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: [BANK_SYNC_REVIEW_KEY, 'counts', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('bank_sync_review_queue')
        .select('bank_account_id')
        .eq('status', 'pending');
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of data ?? []) out[r.bank_account_id] = (out[r.bank_account_id] ?? 0) + 1;
      return out;
    },
  });
}

export interface DecideInput {
  item: ReviewQueueItem;
  candidates: ReviewCandidate[];
  choice: ReviewChoice;
}

export function useBankSyncReviewDecide() {
  const { user } = useAuthContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, candidates, choice }: DecideInput) => {
      if (!user?.id) throw new Error('unauthenticated');
      const planned = planReviewDecision(item, user.id, candidates, choice);
      const { data, error } = await supabase.rpc('bank_sync_review_decide', {
        p_id: item.id,
        p_decision: planned.decision,
        p_target_id: planned.targetId ?? undefined,
        p_counterpart_source_id: planned.counterpartSourceId ?? undefined,
      });
      if (error) {
        logReviewDecisionError(error, item, planned.decision);
        throw error;
      }
      const status = String((data as { status?: string } | null)?.status ?? 'decided');
      logReviewDecision(item, planned, status);
      return { status, decision: planned.decision };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [BANK_SYNC_REVIEW_KEY] });
    },
  });
}
