/**
 * Pure helpers for collaborator payments.
 *
 * A collaborator payment is a real movement of money: one row in
 * `project_collaborator_payments` + one expense in the books. This module only
 * answers "how much is left" and "how should the history read" — every write
 * happens through the RPCs `create_collaborator_payment` /
 * `void_collaborator_payment`.
 *
 * Two facts this module encodes:
 *  - `total_price === 0` means the agreed amount was NEVER ENTERED, so there
 *    is no ceiling at all (remaining === null).
 *  - `legacy_paid_amount` is the pre-ledger number typed by hand. It counts
 *    towards "paid", but it is never changed, voided or turned into money.
 */

export interface CollaboratorPaymentRow {
  id: string;
  collaborator_id: string;
  project_id: string;
  amount: number;
  paid_at: string;
  payment_source: string;
  note?: string | null;
  expense_id?: string | null;
  status: string;
  void_reason?: string | null;
  voided_at?: string | null;
  deleted_at?: string | null;
}

export const DEFAULT_VISIBLE_COLLABORATOR_PAYMENTS = 5;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** A payment that still counts: not voided, not deleted. */
export const isLiveCollaboratorPayment = (p: CollaboratorPaymentRow): boolean =>
  p.status === 'paid' && !p.voided_at && !p.deleted_at;

export const livePayments = (
  payments: readonly CollaboratorPaymentRow[],
): CollaboratorPaymentRow[] => payments.filter(isLiveCollaboratorPayment);

export const voidedPayments = (
  payments: readonly CollaboratorPaymentRow[],
): CollaboratorPaymentRow[] => payments.filter((p) => !isLiveCollaboratorPayment(p));

/** Sum of live payments only. */
export function paidFromPayments(payments: readonly CollaboratorPaymentRow[]): number {
  return round2(livePayments(payments).reduce((s, p) => s + (Number(p.amount) || 0), 0));
}

export interface RemainingInput {
  /** project_collaborators.total_price — 0 means "not entered". */
  totalPrice: number;
  /** project_collaborators.legacy_paid_amount — hand-typed, never touched. */
  legacyPaid: number;
  payments: readonly CollaboratorPaymentRow[];
}

/**
 * What is still owed on this engagement.
 * Returns null when the agreed amount was never entered — then there is no cap.
 */
export function remainingForCollaborator(input: RemainingInput): number | null {
  const total = round2(Number(input.totalPrice) || 0);
  if (total <= 0) return null;
  const paid = round2((Number(input.legacyPaid) || 0) + paidFromPayments(input.payments));
  return round2(total - paid);
}

export interface PayCheck {
  ok: boolean;
  reason: 'ok' | 'invalid_amount' | 'exceeds_remaining';
}

/** `remaining === null` means no ceiling (agreed amount not entered). */
export function canPay(amount: number, remaining: number | null): PayCheck {
  const amt = round2(Number(amount) || 0);
  if (!(amt > 0)) return { ok: false, reason: 'invalid_amount' };
  if (remaining === null) return { ok: true, reason: 'ok' };
  if (amt > round2(remaining) + 0.01) return { ok: false, reason: 'exceeds_remaining' };
  return { ok: true, reason: 'ok' };
}

export interface CollaboratorPaymentMonthGroup {
  /** 'YYYY-MM' */
  key: string;
  monthDate: Date;
  payments: CollaboratorPaymentRow[];
  total: number;
}

export interface CollaboratorPaymentDisplay {
  /** Newest live payments, capped at `limit`. */
  recent: CollaboratorPaymentRow[];
  /** Everything older than `recent`, grouped by month (newest month first). */
  months: CollaboratorPaymentMonthGroup[];
  /** Voided payments — hidden behind their own toggle, never counted. */
  voided: CollaboratorPaymentRow[];
  /** How many live payments sit inside `months`. */
  olderCount: number;
  /** Sum of all live payments. */
  total: number;
}

const byPaidAtDesc = (a: CollaboratorPaymentRow, b: CollaboratorPaymentRow) =>
  a.paid_at < b.paid_at ? 1 : a.paid_at > b.paid_at ? -1 : 0;

/** Last N payments in full, everything older folded into month groups. */
export function groupPaymentsForDisplay(
  payments: readonly CollaboratorPaymentRow[],
  limit: number = DEFAULT_VISIBLE_COLLABORATOR_PAYMENTS,
): CollaboratorPaymentDisplay {
  const live = [...livePayments(payments)].sort(byPaidAtDesc);
  const recent = live.slice(0, Math.max(0, limit));
  const older = live.slice(Math.max(0, limit));

  const map = new Map<string, CollaboratorPaymentMonthGroup>();
  for (const p of older) {
    const d = new Date(p.paid_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let g = map.get(key);
    if (!g) {
      g = { key, monthDate: new Date(d.getFullYear(), d.getMonth(), 1), payments: [], total: 0 };
      map.set(key, g);
    }
    g.payments.push(p);
    g.total = round2(g.total + (Number(p.amount) || 0));
  }

  const months = [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  for (const g of months) g.payments.sort(byPaidAtDesc);

  return {
    recent,
    months,
    voided: [...voidedPayments(payments)].sort(byPaidAtDesc),
    olderCount: older.length,
    total: paidFromPayments(payments),
  };
}
