import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MANUAL_MERGE_ENABLED } from '@/lib/featureFlags';
import {
  findMergeOffers,
  MERGE_OFFER_MAX_DAY_DIFF,
  type MergeOffer,
  type MergeOfferNewTx,
  type MergeOfferRow,
} from '@/lib/mergeOfferCandidate';
import { COUNTED_EXPENSE_STATUSES } from '@/lib/countedExpense';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SELECT_COLUMNS =
  'id, user_id, type, amount, date, payment_source, payment_source_card_id, currency, expense_nature, ' +
  'bank_transaction_id, bank_match_status, bank_raw_line, bank_raw_line_source, bank_account_id, ' +
  'import_batch_id, created_at, is_advance, linked_advance_ids, deleted_at, ' +
  'description, merchant_name, category';

export type MergeCandidateRow = MergeOfferRow;
export type MergeCandidateOffer = MergeOffer<MergeCandidateRow>;

/**
 * Bankovni retci s kojima se novi ručni/slikani unos može spojiti (pravilo
 * „isti trošak", način `offer`). Dohvat sa servera (ne iz učitanog popisa)
 * kako paginacija ne bi sakrila kandidata. Prazno polje = nema ponude.
 */
export function useMergeCandidate() {
  const findMergeCandidates = useCallback(
    async (newTx: Omit<MergeOfferNewTx, 'userId'>): Promise<MergeCandidateOffer[]> => {
      if (!MANUAL_MERGE_ENABLED) return [];
      if (!newTx.payment_source) return [];
      if ((newTx.type ?? 'expense') === 'transfer') return [];

      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return [];

        const base = newTx.date instanceof Date ? newTx.date : new Date(newTx.date);
        if (Number.isNaN(base.getTime())) return [];
        const from = new Date(base.getTime() - (MERGE_OFFER_MAX_DAY_DIFF + 1) * MS_PER_DAY);
        const to = new Date(base.getTime() + (MERGE_OFFER_MAX_DAY_DIFF + 1) * MS_PER_DAY);

        const { data, error } = await supabase
          .from('expenses')
          .select(SELECT_COLUMNS)
          .eq('user_id', uid)
          .is('deleted_at', null)
          .in('status', [...COUNTED_EXPENSE_STATUSES])
          .not('bank_transaction_id', 'is', null)
          .gte('date', from.toISOString())
          .lte('date', to.toISOString())
          .limit(50);
        if (error) throw error;

        const rows = (data ?? []) as unknown as MergeCandidateRow[];
        const cardIds = Array.from(new Set(rows.map(r => r.payment_source_card_id).filter((v): v is string => !!v)));
        let last4ById = new Map<string, string>();
        if (cardIds.length > 0) {
          const { data: cards, error: cardErr } = await supabase
            .from('payment_source_cards' as any)
            .select('id, last_four_digits')
            .in('id', cardIds);
          if (cardErr) throw cardErr;
          last4ById = new Map(((cards ?? []) as unknown as Array<{ id: string; last_four_digits: string | null }>)
            .map(c => [c.id, String(c.last_four_digits ?? '')]));
        }
        const withCards = rows.map(r => ({
          ...r,
          card_last4: r.payment_source_card_id ? last4ById.get(r.payment_source_card_id) ?? null : null,
        }));

        return findMergeOffers({ ...newTx, userId: uid }, withCards);
      } catch (err) {
        console.error('[useMergeCandidate] lookup failed', err);
        return [];
      }
    },
    [],
  );

  return { findMergeCandidates };
}
