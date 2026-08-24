/**
 * Pure helper: should we OFFER "merge with existing" for a transaction the user
 * is about to save (manual entry or receipt scan)?
 *
 * The offer is intentionally narrow — it appears only when there is exactly ONE
 * unambiguous bank row it could belong to. Anything less certain stays silent
 * (the duplicate dialog keeps its current two actions).
 *
 * Conditions (all must hold):
 *  - the new row is manual/scanned (no bank fingerprint yet) and not a transfer
 *    or a balance correction,
 *  - the candidate is a bank row (has a bank fingerprint), alive, not already
 *    confirmed, not advance-linked, not a correction,
 *  - same payment source, same type, same currency,
 *  - amount equal to the cent,
 *  - date difference <= 4 calendar days (cards post a day or two late),
 *  - EXACTLY ONE such candidate exists.
 *
 * Pure module — no React, no Supabase.
 */

import { isSamePaymentSource } from './paymentSource/resolve';
import type { MergeCandidateExpense } from './manualBankMergePair';

export interface MergeOfferNewTx {
  readonly type?: string | null;
  readonly amount: number;
  readonly date: Date | string;
  readonly payment_source?: string | null;
  readonly currency?: string | null;
  readonly expense_nature?: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Cards can post a couple of days after the receipt. */
export const MERGE_OFFER_MAX_DAY_DIFF = 4;

function toDayStart(d: Date | string): number {
  const date = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function calendarDayDiff(a: Date | string, b: Date | string): number {
  const ta = toDayStart(a);
  const tb = toDayStart(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / MS_PER_DAY;
}

function cents(n: number): number {
  return Math.round(Math.abs(Number(n)) * 100);
}

/**
 * Returns the single mergeable bank row, or `null` when the offer must stay
 * silent (no candidate, or more than one).
 */
export function findMergeOfferCandidate(
  newTx: MergeOfferNewTx,
  rows: readonly MergeCandidateExpense[],
): MergeCandidateExpense | null {
  const type = newTx.type ?? 'expense';
  if (type === 'transfer') return null;
  if ((newTx.expense_nature ?? 'regular') === 'correction') return null;
  if (!Number.isFinite(Number(newTx.amount)) || cents(newTx.amount) === 0) return null;

  const newCurrency = (newTx.currency ?? '').toUpperCase();

  const matches = rows.filter((r) => {
    if (!r.bank_transaction_id) return false;
    if (r.deleted_at) return false;
    if (r.bank_match_status === 'confirmed') return false;
    if ((r.type ?? 'expense') !== type) return false;
    if (r.type === 'transfer') return false;
    if ((r.expense_nature ?? 'regular') === 'correction') return false;
    if (r.is_advance) return false;
    if (Array.isArray(r.linked_advance_ids) && r.linked_advance_ids.length > 0) return false;
    if (!isSamePaymentSource(newTx.payment_source ?? null, r.payment_source ?? null)) return false;
    const rowCurrency = (r.currency ?? '').toUpperCase();
    // An unset currency means "source default" on both sides — only an
    // explicit mismatch disqualifies the candidate.
    if (newCurrency && rowCurrency && newCurrency !== rowCurrency) return false;
    if (cents(r.amount) !== cents(newTx.amount)) return false;
    if (calendarDayDiff(newTx.date, r.date) > MERGE_OFFER_MAX_DAY_DIFF) return false;
    return true;
  });

  return matches.length === 1 ? matches[0] : null;
}
