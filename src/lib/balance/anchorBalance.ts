/**
 * Anchor-based balance specification.
 *
 * Pure TypeScript mirror of the SQL function
 * `public.recompute_custom_source_balance` after the Val 3 engine pass.
 * Behaviour is gated by `public.app_settings.anchor_engine_mode`:
 *
 *   Rule B — "day_cut" (default, current production)
 *   ─────────────────────────────────────────────────
 *     final_balance = A + SUM(valid rows where tx.date::date > D::date)
 *     - Transactions BEFORE the anchor day → excluded (covered by A)
 *     - Transactions ON     the anchor day → excluded (covered by A)
 *     - Transactions AFTER  the anchor day → included
 *
 *   Hybrid — "hybrid" (Val 3, opt-in via feature flag)
 *   ───────────────────────────────────────────────────
 *     Per-row cut depending on `timeConfidence`:
 *       - C1/C2       → include IFF `eventAt > anchorDate` (timestamp cut)
 *                       NULL event_at on a C1/C2 row → row is skipped
 *       - C3/C4/NULL  → include IFF `tx.date::date > anchor::date` (day cut)
 *     - `expense_nature === 'correction'` → never counted (both modes)
 *     - `deleted_at !== null`             → never counted (both modes)
 *
 * This file MUST NOT be imported by runtime code paths. It is consumed by
 * the regression test suite so any SQL/TS drift on either mode is caught.
 */

export type ExpenseType = "income" | "expense" | "transfer";
export type ExpenseNature = "regular" | "correction" | string;
export type TimeConfidence = "C1" | "C2" | "C3" | "C4" | null | undefined;

export type AnchorEngineMode = "day_cut" | "hybrid";

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
  /** Val 1 precision foundation. */
  eventAt?: string | null;
  /** Val 2 tier. C1/C2 = precise; C3/C4/null = day-level. */
  timeConfidence?: TimeConfidence;
}

export interface AnchorInput {
  sourceId: string;
  anchorDate: string; // ISO timestamp
  anchorBalance: number;
  expenses: AnchorExpenseRow[];
  /** Defaults to "day_cut" (current production). */
  mode?: AnchorEngineMode;
}

/** Strip a timestamp to its UTC calendar day (YYYY-MM-DD). */
const utcDay = (iso: string): string => iso.slice(0, 10);

const isPreciseTier = (c: TimeConfidence): boolean =>
  c === "C1" || c === "C2";

/**
 * Compute the anchored balance for a single payment source.
 * Mirror of SQL `recompute_custom_source_balance` per selected mode.
 */
export function computeAnchoredBalance(input: AnchorInput): number {
  const mode: AnchorEngineMode = input.mode ?? "day_cut";
  const anchorDay = utcDay(input.anchorDate);
  const anchorTs = Date.parse(input.anchorDate);
  let sum = 0;

  for (const e of input.expenses) {
    if (e.deletedAt) continue;
    if ((e.expenseNature ?? "regular") === "correction") continue;

    let included = false;
    if (mode === "hybrid" && isPreciseTier(e.timeConfidence)) {
      // C1/C2 → timestamp cut. Requires non-null event_at; strict >.
      if (e.eventAt != null) {
        included = Date.parse(e.eventAt) > anchorTs;
      }
    } else {
      // day_cut for everything, OR hybrid C3/C4/null fallback.
      included = utcDay(e.date) > anchorDay;
    }
    if (!included) continue;

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
