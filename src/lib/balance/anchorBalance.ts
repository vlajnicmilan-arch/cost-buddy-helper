/**
 * Anchor-based balance specification — Rule B.
 *
 * Pure TypeScript mirror of the SQL function
 * `public.recompute_custom_source_balance` (migration 20260624131214).
 *
 * Exists ONLY as an executable specification of the locked business rule
 * for payment-source balance corrections:
 *
 *   Rule B — "Anchor cuts the whole calendar day"
 *   ──────────────────────────────────────────────
 *   When a correction sets an anchor on date D with balance A:
 *     final_balance = A + SUM(valid transactions where tx.date::date > D::date)
 *
 *   - Transactions BEFORE the anchor day  → excluded (covered by A)
 *   - Transactions ON     the anchor day  → excluded (covered by A)
 *   - Transactions AFTER  the anchor day  → included
 *   - `expense_nature === 'correction'`    → never counted
 *   - `deleted_at !== null`                → never counted
 *
 * This file MUST NOT be imported by runtime code paths. It is consumed by
 * the regression test suite (`anchorBalance.test.ts`) so that any future
 * change to Rule B is caught in TS even though the canonical logic lives
 * in Postgres.
 */

export type ExpenseType = "income" | "expense" | "transfer";
export type ExpenseNature = "regular" | "correction" | string;

export interface AnchorExpenseRow {
  /** ISO timestamp of the transaction (UI writes YYYY-MM-DD 00:00:00 UTC) */
  date: string;
  type: ExpenseType;
  amount: number;
  /** Source the amount leaves from (expense/transfer-out) or enters (income) */
  paymentSourceId: string | null;
  /** Destination source for transfers (transfer-in side) */
  incomeSourceId: string | null;
  expenseNature?: ExpenseNature | null;
  deletedAt?: string | null;
}

export interface AnchorInput {
  sourceId: string;
  anchorDate: string; // ISO timestamp
  anchorBalance: number;
  expenses: AnchorExpenseRow[];
}

/** Strip a timestamp to its UTC calendar day (YYYY-MM-DD). */
const utcDay = (iso: string): string => iso.slice(0, 10);

/**
 * Compute the anchored balance for a single payment source under Rule B.
 * Returns `anchorBalance + sum of post-anchor-day signed contributions`.
 */
export function computeAnchoredBalance(input: AnchorInput): number {
  const anchorDay = utcDay(input.anchorDate);
  let sum = 0;

  for (const e of input.expenses) {
    if (e.deletedAt) continue;
    if ((e.expenseNature ?? "regular") === "correction") continue;

    // Rule B: strictly AFTER the anchor calendar day
    if (utcDay(e.date) <= anchorDay) continue;

    const isOutbound = e.paymentSourceId === input.sourceId;
    const isInboundTransfer =
      e.type === "transfer" && e.incomeSourceId === input.sourceId;

    if (!isOutbound && !isInboundTransfer) continue;

    if (e.type === "income" && isOutbound) sum += e.amount;
    else if (e.type === "expense" && isOutbound) sum -= e.amount;
    else if (e.type === "transfer" && isOutbound) sum -= e.amount;
    else if (e.type === "transfer" && isInboundTransfer) sum += e.amount;
  }

  return Number((input.anchorBalance + sum).toFixed(2));
}
