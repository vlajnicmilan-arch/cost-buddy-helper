/**
 * balanceEngineMirror
 *
 * In-memory TypeScript mirror of the Postgres balance engine.
 * Mirrors the exact logic from these migrations:
 *   - 20260624083605 (anchor columns + recompute + trigger baseline)
 *   - 20260624132036 (trigger split: recompute for anchored, incremental delta for unanchored)
 *   - 20260628205415 (hybrid vs day_cut mode via app_settings.anchor_engine_mode)
 *
 * PURPOSE: Fast vitest coverage of balance regressions. This is NOT a source
 * of truth — the SQL suite under supabase/tests/balance/ is authoritative for
 * anything that touches the real trigger / recompute functions.
 *
 * SEMANTIC NOTES:
 * - Correction rows (expense_nature='correction') never contribute to sums.
 * - Soft-deleted rows (deleted_at != null) never contribute to sums.
 * - Anchor cut is strictly `>` (both DAY-based and timestamp-based). Rows
 *   whose event_at/date equals the anchor boundary are EXCLUDED. This mirrors
 *   the SQL and is intentional per project decision — do not change.
 * - hybrid mode: C1/C2 rows use event_at > anchor_ts (timestamp precision).
 *                C3/C4/null rows use date > anchor_date (day precision).
 *   → Consequence: a C3 row entered on the SAME DAY as the anchor is excluded
 *     even though its wall-clock time is after the anchor. This is BUG 1 and
 *     is expected to be fixed by a future `manual_entry` intent that promotes
 *     manual writes to C2 semantics.
 */

export type ExpenseType = "income" | "expense" | "transfer";
export type TimeConfidence = "C1" | "C2" | "C3" | "C4" | null;
export type ExpenseNature = "regular" | "correction" | null;
export type EngineMode = "day_cut" | "hybrid";

export interface Expense {
  id: string;
  type: ExpenseType;
  amount: number;
  /** 'custom:UUID' or null */
  payment_source: string | null;
  /** transfer destination or null */
  income_source_id: string | null;
  /** DAY-precision timestamp (UTC midnight is fine) */
  date: Date;
  /** wall-clock timestamp of the actual event (C1/C2 precision) */
  event_at: Date | null;
  time_confidence: TimeConfidence;
  expense_nature: ExpenseNature;
  deleted_at: Date | null;
}

export interface CustomSource {
  id: string;
  balance: number;
  correction_anchor_date: Date | null;
  correction_anchor_balance: number | null;
}

// ---------- helpers ----------

export function extractCustomSourceId(paymentSource: string | null): string | null {
  if (!paymentSource) return null;
  if (!paymentSource.startsWith("custom:")) return null;
  const id = paymentSource.slice(7);
  return id || null;
}

function utcDay(d: Date): number {
  // Days since epoch in UTC — matches PG `(ts AT TIME ZONE 'UTC')::date`.
  return Math.floor(d.getTime() / 86_400_000);
}

function isLiveRegular(e: Expense): boolean {
  return e.deleted_at === null && (e.expense_nature ?? "regular") !== "correction";
}

/** Signed contribution of a live regular expense to a given source. */
function signedAmount(e: Expense, sourceId: string): number {
  const src = extractCustomSourceId(e.payment_source);
  const dst = e.type === "transfer" ? e.income_source_id : null;
  if (e.type === "income" && src === sourceId) return e.amount;
  if (e.type === "expense" && src === sourceId) return -e.amount;
  if (e.type === "transfer" && src === sourceId) return -e.amount;
  if (e.type === "transfer" && dst === sourceId) return e.amount;
  return 0;
}

/** True if the row contributes AFTER the anchor in the given mode. */
export function isPostAnchor(e: Expense, anchor: Date, mode: EngineMode): boolean {
  if (mode === "hybrid" && (e.time_confidence === "C1" || e.time_confidence === "C2") && e.event_at) {
    return e.event_at.getTime() > anchor.getTime();
  }
  // day_cut, or C3/C4/null in hybrid → strict day-level `>`.
  return utcDay(e.date) > utcDay(anchor);
}

// ---------- engine ----------

export class BalanceEngine {
  sources = new Map<string, CustomSource>();
  expenses = new Map<string, Expense>();
  mode: EngineMode;

  constructor(mode: EngineMode = "day_cut") {
    this.mode = mode;
  }

  addSource(s: CustomSource) {
    this.sources.set(s.id, { ...s });
  }

  /**
   * Atomic anchor set (BUG 2 remediation contract):
   * setting the anchor MUST also run recompute so `stored` is never
   * inconsistent with the engine afterwards.
   */
  setAnchor(sourceId: string, anchorDate: Date, anchorBalance: number) {
    const s = this.sources.get(sourceId);
    if (!s) throw new Error(`unknown source ${sourceId}`);
    s.correction_anchor_date = anchorDate;
    s.correction_anchor_balance = anchorBalance;
    this.recompute(sourceId);
  }

  /**
   * Simulates the buggy path (BUG 2): SET the anchor columns directly WITHOUT
   * a follow-up recompute. Test A4 uses this to prove the atomic contract.
   */
  setAnchorBuggy(sourceId: string, anchorDate: Date, anchorBalance: number) {
    const s = this.sources.get(sourceId);
    if (!s) throw new Error(`unknown source ${sourceId}`);
    s.correction_anchor_date = anchorDate;
    s.correction_anchor_balance = anchorBalance;
  }

  /** Full recompute — matches SQL recompute_custom_source_balance. */
  recompute(sourceId: string): number | null {
    const s = this.sources.get(sourceId);
    if (!s) return null;
    // Unanchored: SQL function is a no-op (returns NULL); incremental delta
    // path maintains the balance instead.
    if (s.correction_anchor_date === null || s.correction_anchor_balance === null) {
      return null;
    }
    let sum = 0;
    for (const e of this.expenses.values()) {
      if (!isLiveRegular(e)) continue;
      const contributes =
        extractCustomSourceId(e.payment_source) === sourceId ||
        e.income_source_id === sourceId;
      if (!contributes) continue;
      if (!isPostAnchor(e, s.correction_anchor_date, this.mode)) continue;
      sum += signedAmount(e, sourceId);
    }
    s.balance = round2(s.correction_anchor_balance + sum);
    return s.balance;
  }

  /** Affected source IDs for a row change (OLD + NEW variants). */
  private affected(oldE: Expense | null, newE: Expense | null): string[] {
    const set = new Set<string>();
    for (const e of [oldE, newE]) {
      if (!e) continue;
      const src = extractCustomSourceId(e.payment_source);
      if (src) set.add(src);
      if (e.type === "transfer" && e.income_source_id) set.add(e.income_source_id);
    }
    return [...set];
  }

  private runTrigger(oldE: Expense | null, newE: Expense | null) {
    for (const id of this.affected(oldE, newE)) {
      const s = this.sources.get(id);
      if (!s) continue;
      if (s.correction_anchor_date !== null) {
        this.recompute(id);
        continue;
      }
      // Unanchored: incremental delta
      let delta = 0;
      if (oldE && isLiveRegular(oldE)) delta -= signedAmount(oldE, id);
      if (newE && isLiveRegular(newE)) delta += signedAmount(newE, id);
      if (delta !== 0) s.balance = round2(s.balance + delta);
    }
  }

  insert(e: Expense) {
    this.expenses.set(e.id, { ...e });
    this.runTrigger(null, this.expenses.get(e.id)!);
  }

  update(id: string, patch: Partial<Expense>) {
    const prev = this.expenses.get(id);
    if (!prev) throw new Error(`unknown expense ${id}`);
    const oldE = { ...prev };
    const next = { ...prev, ...patch };
    this.expenses.set(id, next);
    this.runTrigger(oldE, next);
  }

  softDelete(id: string, at: Date = new Date()) {
    this.update(id, { deleted_at: at });
  }

  restore(id: string) {
    this.update(id, { deleted_at: null });
  }

  balanceOf(sourceId: string): number {
    const s = this.sources.get(sourceId);
    if (!s) throw new Error(`unknown source ${sourceId}`);
    return s.balance;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
