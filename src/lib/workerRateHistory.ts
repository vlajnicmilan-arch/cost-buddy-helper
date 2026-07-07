/**
 * Pure helpers for the V1-B worker rate history feature.
 *
 * SQL contract: `public.rate_at(worker_id, date)` — returns the rate row with
 * the greatest `effective_from <= date`. This file mirrors that contract for
 * the client (KPI computation, payout preview) so we don't round-trip per row.
 *
 * Keep in sync with supabase/migrations/20260707164727_*.sql (rate_at function).
 */

export interface RateHistoryRow {
  worker_id: string;
  rate: number;
  effective_from: string; // ISO date YYYY-MM-DD
}

export interface WorkEntryForCost {
  worker_id: string;
  work_date: string;   // ISO date
  actual_hours: number;
  payout_id?: string | null;
}

/**
 * Client-side mirror of SQL rate_at(). Falls back to `fallback` when no
 * history row matches (should not happen after backfill).
 */
export function rateAtLocal(
  history: readonly RateHistoryRow[],
  workerId: string,
  date: string,
  fallback: number,
): number {
  let best: RateHistoryRow | null = null;
  for (const r of history) {
    if (r.worker_id !== workerId) continue;
    if (r.effective_from > date) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best ? best.rate : fallback;
}

export interface WorkerCostTotals {
  workerId: string;
  totalHours: number;
  totalCost: number;
  remainingHours: number;
  remainingCost: number;
  currentMonthHours: number;
  currentMonthCost: number;
}

/**
 * Compute per-worker cost totals using per-day rate lookup.
 * `fallbackByWorker` supplies the current `project_workers.hourly_rate` per
 * worker — used only when history is empty (defensive).
 */
export function computeWorkerCostTotals(
  entries: readonly WorkEntryForCost[],
  history: readonly RateHistoryRow[],
  fallbackByWorker: Readonly<Record<string, number>>,
  now: Date = new Date(),
): Record<string, WorkerCostTotals> {
  const cmStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const cmEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const out: Record<string, WorkerCostTotals> = {};

  for (const e of entries) {
    const fallback = fallbackByWorker[e.worker_id] ?? 0;
    const rate = rateAtLocal(history, e.worker_id, e.work_date, fallback);
    const cost = e.actual_hours * rate;

    let t = out[e.worker_id];
    if (!t) {
      t = out[e.worker_id] = {
        workerId: e.worker_id,
        totalHours: 0, totalCost: 0,
        remainingHours: 0, remainingCost: 0,
        currentMonthHours: 0, currentMonthCost: 0,
      };
    }
    t.totalHours += e.actual_hours;
    t.totalCost += cost;

    const d = new Date(e.work_date);
    if (d >= cmStart && d < cmEnd) {
      t.currentMonthHours += e.actual_hours;
      t.currentMonthCost += cost;
    }
    if (!e.payout_id) {
      t.remainingHours += e.actual_hours;
      t.remainingCost += cost;
    }
  }

  return out;
}
