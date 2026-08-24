import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MANUAL_MERGE_ENABLED } from '@/lib/featureFlags';
import {
  findMergeOfferCandidate,
  MERGE_OFFER_MAX_DAY_DIFF,
  type MergeOfferNewTx,
} from '@/lib/mergeOfferCandidate';
import type { MergeCandidateExpense } from '@/lib/manualBankMergePair';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SELECT_COLUMNS =
  'id, user_id, type, amount, date, payment_source, currency, expense_nature, ' +
  'bank_transaction_id, bank_match_status, is_advance, linked_advance_ids, deleted_at, ' +
  'description, merchant_name, category';

export interface MergeCandidateRow extends MergeCandidateExpense {
  description?: string | null;
  merchant_name?: string | null;
  category?: string | null;
}

/**
 * Looks up the single bank row a manual/scanned transaction could be merged
 * into. Server-side lookup (not the loaded list) so pagination can't hide the
 * candidate. Returns `null` whenever the answer is not unambiguous.
 */
export function useMergeCandidate() {
  const findMergeCandidate = useCallback(
    async (newTx: MergeOfferNewTx): Promise<MergeCandidateRow | null> => {
      if (!MANUAL_MERGE_ENABLED) return null;
      if (!newTx.payment_source) return null;
      if ((newTx.type ?? 'expense') === 'transfer') return null;

      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return null;

        const base = newTx.date instanceof Date ? newTx.date : new Date(newTx.date);
        if (Number.isNaN(base.getTime())) return null;
        const from = new Date(base.getTime() - (MERGE_OFFER_MAX_DAY_DIFF + 1) * MS_PER_DAY);
        const to = new Date(base.getTime() + (MERGE_OFFER_MAX_DAY_DIFF + 1) * MS_PER_DAY);

        const { data, error } = await supabase
          .from('expenses')
          .select(SELECT_COLUMNS)
          .eq('user_id', uid)
          .is('deleted_at', null)
          .not('bank_transaction_id', 'is', null)
          .gte('date', from.toISOString())
          .lte('date', to.toISOString())
          .limit(50);

        if (error) throw error;

        return (findMergeOfferCandidate(newTx, (data ?? []) as unknown as MergeCandidateRow[]) ??
          null) as MergeCandidateRow | null;
      } catch (err) {
        console.error('[useMergeCandidate] lookup failed', err);
        return null;
      }
    },
    [],
  );

  return { findMergeCandidate };
}
