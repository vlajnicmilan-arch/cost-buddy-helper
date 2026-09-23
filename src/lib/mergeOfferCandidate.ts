/**
 * PONUDA SPAJANJA kod ručnog unosa / slike računa (nalog 4).
 *
 * Odluku o kandidatima donosi pravilo „isti trošak" u načinu `offer`
 * (`findSameExpenseOffers`): isti vlasnik, novčanik i vrsta, iznos do centa,
 * ±4 dana, bankovni redak nije potvrđen, nije prijenos/korekcija/avans.
 * Vraća SVE kandidate, poredane kako ih vrati pravilo (sličan trgovac prvi,
 * pa blizina datuma). Nikad ne spaja samo — korisnik bira.
 *
 * Dodatna zaštita valute: kandidat ispada samo kad su OBJE valute upisane
 * i različite (prazna = EUR).
 *
 * Čisti modul — bez Reacta i Supabasea.
 */

import { findSameExpenseOffers, SAME_EXPENSE_OFFER_MAX_DAYS, type SameExpenseRow } from './sameExpenseRule';
import { toRuleDay } from './importReview/sameExpenseImport';
import type { MergeCandidateExpense } from './manualBankMergePair';

export interface MergeOfferNewTx {
  /** Vlasnik novog retka (prijavljeni korisnik). Obavezan. */
  readonly userId: string;
  readonly type?: string | null;
  readonly amount: number;
  readonly date: Date | string;
  readonly payment_source?: string | null;
  readonly currency?: string | null;
  readonly expense_nature?: string | null;
  readonly merchant_name?: string | null;
  readonly description?: string | null;
}

/** Bankovni redak s podacima za prikaz u ponudi. */
export interface MergeOfferRow extends MergeCandidateExpense {
  readonly merchant_name?: string | null;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly payment_source_card_id?: string | null;
  readonly card_last4?: string | null;
  readonly bank_raw_line?: string | null;
  readonly bank_raw_line_source?: string | null;
  readonly bank_account_id?: string | null;
  readonly import_batch_id?: string | null;
  readonly created_at?: string | null;
}

export type MergeOfferOrigin = 'sync' | 'statement';

export interface MergeOffer<R extends MergeOfferRow = MergeOfferRow> {
  readonly row: R;
  readonly merchantSimilar: boolean;
  readonly dayDiff: number;
  /** Odakle je bankovni redak stigao. */
  readonly origin: MergeOfferOrigin;
  /** Kad je redak stigao u aplikaciju (created_at). */
  readonly arrivedAt: string | null;
}

/** Cards can post a couple of days after the receipt. */
export const MERGE_OFFER_MAX_DAY_DIFF = SAME_EXPENSE_OFFER_MAX_DAYS;

const normCurrency = (c: string | null | undefined): string => ((c ?? '').trim() || 'EUR').toUpperCase();

export function mergeOfferOrigin(row: Pick<MergeOfferRow, 'bank_account_id'>): MergeOfferOrigin {
  return row.bank_account_id ? 'sync' : 'statement';
}

type RuleRow<R> = SameExpenseRow & { readonly source: R };

/**
 * Svi bankovni retci koje korisnik može spojiti s novim unosom.
 * Prazno polje = ponuda se ne prikazuje.
 */
export function findMergeOffers<R extends MergeOfferRow>(
  newTx: MergeOfferNewTx,
  rows: readonly R[],
): MergeOffer<R>[] {
  const manual: SameExpenseRow = {
    id: '__new__',
    userId: newTx.userId,
    paymentSource: newTx.payment_source ?? null,
    type: newTx.type ?? 'expense',
    amount: Number(newTx.amount),
    date: toRuleDay(newTx.date),
    merchantName: newTx.merchant_name ?? null,
    description: newTx.description ?? null,
    expenseNature: newTx.expense_nature ?? null,
    origin: { kind: 'manual' },
  };
  const newCurrency = normCurrency(newTx.currency);
  const banks: RuleRow<R>[] = rows
    .filter(r => normCurrency(r.currency) === newCurrency)
    .map(r => ({
      id: r.id,
      userId: r.user_id,
      paymentSource: r.payment_source ?? null,
      type: r.type ?? 'expense',
      amount: Number(r.amount),
      date: toRuleDay(r.date as Date | string),
      merchantName: r.merchant_name ?? null,
      description: r.description ?? null,
      cardId: r.payment_source_card_id ?? null,
      cardLast4: r.card_last4 ?? null,
      expenseNature: r.expense_nature ?? null,
      isAdvance: r.is_advance ?? null,
      linkedAdvanceIds: r.linked_advance_ids ?? null,
      deletedAt: r.deleted_at ?? null,
      bankTransactionId: r.bank_transaction_id ?? null,
      bankMatchStatus: r.bank_match_status ?? null,
      bankRawLine: r.bank_raw_line ?? null,
      source: r,
    }));
  return findSameExpenseOffers(manual, banks).map(o => ({
    row: o.row.source,
    merchantSimilar: o.merchantSimilar,
    dayDiff: o.dayDiff,
    origin: mergeOfferOrigin(o.row.source),
    arrivedAt: o.row.source.created_at ?? null,
  }));
}
