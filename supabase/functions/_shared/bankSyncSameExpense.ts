/**
 * BANKOVNA SINKRONIZACIJA × PRAVILO „ISTI TROŠAK" (nalog 2 od 4).
 *
 * Za TROŠAK i PRIHOD (ne prijenos) spajanje bankovnog retka s ručnim/slikanim
 * odlučuje `sameExpenseRule` u načinu `auto`. Spaja se SAMO na `match`.
 * Grana prijenosa ostaje na starom `pickMergeTarget` — ovaj modul je ne dira.
 *
 * Jedan-na-jedan unutar pokretanja: sve odluke se računaju ODJEDNOM, prije
 * pisanja, kroz `decideSameExpenseAutoBatch` nad unijom kandidata. To je
 * jednako pozivu batch funkcije jer pravilo samo filtrira iznos, datum, izvor
 * i vlasnika, a upit svakog retka pokriva njegov vlastiti prozor pravila.
 */
import {
  decideSameExpenseAutoBatch,
  type CardWalletMap,
  type SameExpenseAutoResult,
  type SameExpenseRow,
} from './sameExpenseRule.ts';

/** Stupci kandidata koje sinkronizacija dohvaća (vlasnik IZ BAZE). */
export const SYNC_MERGE_CANDIDATE_COLUMNS =
  'id, user_id, amount, date, description, merchant_name, payment_source, payment_source_card_id, expense_nature, is_advance, linked_advance_ids, deleted_at, bank_transaction_id, bank_match_status, type, status';

export interface SyncCandidateDbRow {
  readonly id: string;
  readonly user_id: string;
  readonly amount: number | string;
  readonly date: string;
  readonly type?: string | null;
  readonly description?: string | null;
  readonly merchant_name?: string | null;
  readonly payment_source?: string | null;
  readonly payment_source_card_id?: string | null;
  readonly expense_nature?: string | null;
  readonly is_advance?: boolean | null;
  readonly linked_advance_ids?: readonly string[] | null;
  readonly deleted_at?: string | null;
  readonly bank_transaction_id?: string | null;
  readonly bank_match_status?: string | null;
  readonly status?: string | null;
}

export interface SyncManualRuleRow extends SameExpenseRow {
  readonly db: SyncCandidateDbRow;
}

/** Postojeći filtar: samo retci koji se broje i nisu ovaj isti bankovni redak. */
export function countedCandidates<T extends SyncCandidateDbRow>(rows: readonly T[], stableId: string): T[] {
  return rows
    .filter((r) => !r.status || r.status === 'approved')
    .filter((r) => r.bank_transaction_id !== stableId);
}

export function toManualRuleRow(r: SyncCandidateDbRow): SyncManualRuleRow {
  return {
    id: r.id,
    userId: r.user_id,
    paymentSource: r.payment_source ?? null,
    type: r.type ?? 'expense',
    amount: Number(r.amount),
    date: r.date,
    merchantName: r.merchant_name ?? null,
    description: r.description ?? null,
    cardId: r.payment_source_card_id ?? null,
    expenseNature: r.expense_nature ?? null,
    isAdvance: r.is_advance ?? null,
    linkedAdvanceIds: r.linked_advance_ids ?? null,
    deletedAt: r.deleted_at ?? null,
    bankTransactionId: r.bank_transaction_id ?? null,
    bankMatchStatus: r.bank_match_status ?? null,
    origin: { kind: 'manual' },
    db: r,
  };
}

export interface SyncBankInput {
  readonly stableId: string;
  /** Vlasnik bankovnog računa. */
  readonly userId: string;
  readonly paymentSource: string;
  readonly type: 'expense' | 'income';
  readonly amount: number;
  /** Datum knjiženja. */
  readonly date: string;
  /** `counterpartyOf(tx, description)`. */
  readonly counterparty: string | null;
  readonly description: string | null;
  /** `decision.paymentSourceCardId`. */
  readonly cardId: string | null;
}

export function toBankRuleRow(b: SyncBankInput): SameExpenseRow {
  return {
    id: `bank:${b.stableId}`,
    userId: b.userId,
    paymentSource: b.paymentSource,
    type: b.type,
    amount: b.amount,
    date: b.date,
    merchantName: b.counterparty || null,
    description: b.description,
    cardId: b.cardId,
    bankTransactionId: b.stableId,
    origin: { kind: 'sync', importedAt: null },
  };
}

/** Sve kartice vlasnika → novčanik. */
export function cardWalletMapFrom(
  rows: readonly { id: string; payment_source_id?: string | null }[],
): CardWalletMap {
  const out: Record<string, string> = {};
  for (const r of rows) if (r.id && r.payment_source_id) out[r.id] = r.payment_source_id;
  return out;
}

export interface SyncSameExpenseEntry {
  readonly bank: SyncBankInput;
  /** Kandidati iz upita za TAJ redak (sirovi, iz baze). */
  readonly candidates: readonly SyncCandidateDbRow[];
}

/**
 * Odluke za sve knjižene retke pokretanja (ključ = stableId). Kandidati tipa
 * `transfer` ne ulaze u pravilo — oni ostaju starom putu.
 */
export function planSyncSameExpense(
  entries: readonly SyncSameExpenseEntry[],
  cardWallets: CardWalletMap,
): Map<string, SameExpenseAutoResult<SyncManualRuleRow>> {
  const union = new Map<string, SyncManualRuleRow>();
  for (const e of entries) {
    for (const r of countedCandidates(e.candidates, e.bank.stableId)) {
      if ((r.type ?? 'expense') === 'transfer') continue;
      if (!union.has(r.id)) union.set(r.id, toManualRuleRow(r));
    }
  }
  const banks = entries.map((e) => toBankRuleRow(e.bank));
  const results = decideSameExpenseAutoBatch(banks, [...union.values()], cardWallets);
  const out = new Map<string, SameExpenseAutoResult<SyncManualRuleRow>>();
  entries.forEach((e, i) => out.set(e.bank.stableId, results[i]));
  return out;
}

export type SyncMergeChoice =
  | { readonly kind: 'rule'; readonly id: string }
  | { readonly kind: 'transfer'; readonly id: string }
  | { readonly kind: 'none'; readonly reason: string | null };

/**
 * Konačni izbor za NE-prijenosni bankovni redak.
 *  - pravilo `match` → spoji (osim ako je ručni redak u ovom pokretanju već
 *    spojen/uparen ili postoji i kandidat-prijenos → ne spaja).
 *  - kandidat-prijenos (stari `pickMergeTarget`) samo kad pravilo nema nikoga.
 */
export function chooseSyncMerge(
  rule: SameExpenseAutoResult<SyncManualRuleRow> | undefined,
  transferTargetId: string | null,
  usedIds: ReadonlySet<string>,
): SyncMergeChoice {
  if (rule?.outcome === 'match' && rule.candidate) {
    if (usedIds.has(rule.candidate.id)) return { kind: 'none', reason: 'candidate_already_used_in_run' };
    if (transferTargetId) return { kind: 'none', reason: 'rule_match_and_transfer_candidate' };
    return { kind: 'rule', id: rule.candidate.id };
  }
  if ((!rule || rule.outcome === 'none') && transferTargetId && !usedIds.has(transferTargetId)) {
    return { kind: 'transfer', id: transferTargetId };
  }
  return { kind: 'none', reason: null };
}
