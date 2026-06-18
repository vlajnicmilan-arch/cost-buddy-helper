/**
 * Pure helper: determine whether exactly 2 selected expenses are eligible for
 * post-facto manual ↔ bank merge (Phase 1 of "spoji ručnu s izvodom" feature).
 *
 * One row must be a manual entry (bank_transaction_id IS NULL) and the other a
 * bank/CSV import row (bank_transaction_id IS NOT NULL). All other attributes
 * (type, payment_source, currency) must match. Amount tolerance is 0.1%,
 * date tolerance is 3 days.
 *
 * Pure module — no React, no Supabase.
 */

import { isSamePaymentSource } from './paymentSource/resolve';



export interface MergeCandidateExpense {
  readonly id: string;
  readonly user_id?: string | null;
  readonly type?: string | null;
  readonly amount: number;
  readonly date: Date | string;
  readonly payment_source?: string | null;
  readonly currency?: string | null;
  readonly expense_nature?: string | null;
  readonly bank_transaction_id?: string | null;
  readonly bank_match_status?: string | null;
  readonly is_advance?: boolean | null;
  readonly linked_advance_ids?: readonly string[] | null;
  readonly deleted_at?: string | null;
}

export type MergeReason =
  | 'transactions.merge.errors.notTwoSelected'
  | 'transactions.merge.errors.bothManual'
  | 'transactions.merge.errors.bothBank'
  | 'transactions.merge.errors.differentType'
  | 'transactions.merge.errors.differentSource'
  | 'transactions.merge.errors.differentCurrency'
  | 'transactions.merge.errors.differentAmount'
  | 'transactions.merge.errors.dateTooFar'
  | 'transactions.merge.errors.transferNature'
  | 'transactions.merge.errors.correctionNature'
  | 'transactions.merge.errors.alreadyConfirmed'
  | 'transactions.merge.errors.advanceProtected'
  | 'transactions.merge.errors.deleted'
  | 'transactions.merge.errors.differentUser';

export type MergeCheck =
  | { ok: true; manual: MergeCandidateExpense; bank: MergeCandidateExpense }
  | { ok: false; reason: MergeReason };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE = 0.001; // 0.1%
const MAX_DAY_DIFF = 3;

function toDayStart(d: Date | string): number {
  const date = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayDiff(a: Date | string, b: Date | string): number {
  const ta = toDayStart(a);
  const tb = toDayStart(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / MS_PER_DAY;
}

function isBank(e: MergeCandidateExpense): boolean {
  return !!e.bank_transaction_id;
}

function hasAdvanceLink(e: MergeCandidateExpense): boolean {
  return !!e.is_advance || (Array.isArray(e.linked_advance_ids) && e.linked_advance_ids.length > 0);
}

export function isMergeablePair(
  a: MergeCandidateExpense | undefined,
  b: MergeCandidateExpense | undefined,
): MergeCheck {
  if (!a || !b) return { ok: false, reason: 'transactions.merge.errors.notTwoSelected' };

  if (a.deleted_at || b.deleted_at) return { ok: false, reason: 'transactions.merge.errors.deleted' };

  if (a.user_id && b.user_id && a.user_id !== b.user_id) {
    return { ok: false, reason: 'transactions.merge.errors.differentUser' };
  }

  const aBank = isBank(a);
  const bBank = isBank(b);
  if (aBank && bBank) return { ok: false, reason: 'transactions.merge.errors.bothBank' };
  if (!aBank && !bBank) return { ok: false, reason: 'transactions.merge.errors.bothManual' };

  const bank = aBank ? a : b;
  const manual = aBank ? b : a;

  if (manual.bank_match_status === 'confirmed') {
    return { ok: false, reason: 'transactions.merge.errors.alreadyConfirmed' };
  }

  if ((a.type ?? '') !== (b.type ?? '')) {
    return { ok: false, reason: 'transactions.merge.errors.differentType' };
  }
  if (a.type === 'transfer' || b.type === 'transfer') {
    return { ok: false, reason: 'transactions.merge.errors.transferNature' };
  }
  if (a.expense_nature === 'correction' || b.expense_nature === 'correction') {
    return { ok: false, reason: 'transactions.merge.errors.correctionNature' };
  }

  if ((a.payment_source ?? '') !== (b.payment_source ?? '')) {
    return { ok: false, reason: 'transactions.merge.errors.differentSource' };
  }

  const aCur = (a.currency ?? '').toUpperCase();
  const bCur = (b.currency ?? '').toUpperCase();
  if (aCur !== bCur) {
    return { ok: false, reason: 'transactions.merge.errors.differentCurrency' };
  }

  if (hasAdvanceLink(a) || hasAdvanceLink(b)) {
    return { ok: false, reason: 'transactions.merge.errors.advanceProtected' };
  }

  const aAmt = Math.abs(Number(a.amount));
  const bAmt = Math.abs(Number(b.amount));
  const maxAmt = Math.max(aAmt, bAmt);
  if (maxAmt === 0 || Math.abs(aAmt - bAmt) / maxAmt > AMOUNT_TOLERANCE) {
    return { ok: false, reason: 'transactions.merge.errors.differentAmount' };
  }

  if (dayDiff(a.date, b.date) > MAX_DAY_DIFF) {
    return { ok: false, reason: 'transactions.merge.errors.dateTooFar' };
  }

  return { ok: true, manual, bank };
}

export function canMergeSelection(selected: readonly MergeCandidateExpense[]): MergeCheck {
  if (selected.length !== 2) {
    return { ok: false, reason: 'transactions.merge.errors.notTwoSelected' };
  }
  return isMergeablePair(selected[0], selected[1]);
}
