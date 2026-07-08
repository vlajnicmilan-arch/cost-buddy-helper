/**
 * Historically accurate project labor cost.
 *
 * For each work entry we look up the worker's rate on the day of the entry
 * from `project_worker_rate_history` (mirroring the `rate_at()` SQL helper).
 * Falls back to `worker.hourly_rate` only when no history row exists for
 * that worker at or before `work_date`; missing-history workers are reported
 * so the caller can console.warn once.
 *
 * Pure fn — no Supabase, fully unit-testable.
 */

export interface LaborRateHistoryRow {
  worker_id: string;
  rate: number | string | null;
  effective_from: string; // ISO date YYYY-MM-DD
}

export interface LaborWorkerRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  hourly_rate: number | string | null;
}

export interface LaborWorkEntryRow {
  worker_id: string;
  actual_hours: number | string | null;
  work_date: string; // ISO date
}

export interface LaborWorkerDetail {
  id: string;
  name: string;
  hours: number;
  /** Effective average rate over the entries (gross / hours) */
  rate: number;
  cost: number;
}

export interface LaborResult {
  laborCost: number;
  workerDetails: LaborWorkerDetail[];
  /** Worker IDs for which we had to fall back to worker.hourly_rate for at least one entry. */
  missingHistoryWorkerIds: string[];
}

export interface LaborInput {
  workers: LaborWorkerRow[] | null | undefined;
  workEntries: LaborWorkEntryRow[] | null | undefined;
  rateHistory: LaborRateHistoryRow[] | null | undefined;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Group rate history by worker_id, sorted by effective_from DESC so that
 * the first row whose effective_from <= target date is the applicable rate.
 */
const groupHistory = (
  rows: LaborRateHistoryRow[],
): Map<string, LaborRateHistoryRow[]> => {
  const map = new Map<string, LaborRateHistoryRow[]>();
  for (const r of rows) {
    if (!r?.worker_id) continue;
    const arr = map.get(r.worker_id);
    if (arr) arr.push(r);
    else map.set(r.worker_id, [r]);
  }
  map.forEach((arr) =>
    arr.sort((a, b) =>
      a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0,
    ),
  );
  return map;
};

/**
 * rate_at() mirror: returns the historical rate for workerId on dateISO,
 * or null if no history row is <= dateISO.
 */
export const rateAtFromHistory = (
  workerId: string,
  dateISO: string,
  historyByWorker: Map<string, LaborRateHistoryRow[]>,
): number | null => {
  const arr = historyByWorker.get(workerId);
  if (!arr || arr.length === 0) return null;
  for (const r of arr) {
    if (r.effective_from <= dateISO) return num(r.rate);
  }
  return null;
};

export const computeProjectLaborCost = (input: LaborInput): LaborResult => {
  const workers = input.workers ?? [];
  const entries = input.workEntries ?? [];
  const history = groupHistory(input.rateHistory ?? []);

  const workerFallback = new Map<string, { name: string; fallback: number }>();
  for (const w of workers) {
    workerFallback.set(w.id, {
      name: `${w.first_name ?? ''} ${w.last_name ?? ''}`.trim(),
      fallback: num(w.hourly_rate),
    });
  }

  const perWorker = new Map<string, { hours: number; cost: number }>();
  const missing = new Set<string>();

  for (const e of entries) {
    const meta = workerFallback.get(e.worker_id);
    if (!meta) continue; // orphan entry — ignore
    const hours = num(e.actual_hours);
    if (hours === 0) continue;
    const historical = rateAtFromHistory(e.worker_id, e.work_date, history);
    let rate: number;
    if (historical === null) {
      missing.add(e.worker_id);
      rate = meta.fallback;
    } else {
      rate = historical;
    }
    const agg = perWorker.get(e.worker_id) ?? { hours: 0, cost: 0 };
    agg.hours += hours;
    agg.cost += hours * rate;
    perWorker.set(e.worker_id, agg);
  }

  let laborCost = 0;
  const details: LaborWorkerDetail[] = [];
  perWorker.forEach((v, id) => {
    laborCost += v.cost;
    const meta = workerFallback.get(id);
    details.push({
      id,
      name: meta?.name ?? '',
      hours: v.hours,
      rate: v.hours > 0 ? v.cost / v.hours : 0,
      cost: v.cost,
    });
  });

  return {
    laborCost,
    workerDetails: details,
    missingHistoryWorkerIds: Array.from(missing),
  };
};
