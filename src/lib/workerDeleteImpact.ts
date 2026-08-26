/**
 * What is lost when a worker engagement is deleted.
 *
 * Pure helper: counts the work entries that would cascade away with the
 * engagement and, when a rate is known, the money value of those hours.
 * Presentation only — it changes no deletion logic.
 */

export interface WorkerDeleteImpactEntry {
  worker_id: string;
  actual_hours: number;
}

export interface WorkerDeleteImpact {
  entryCount: number;
  hours: number;
  /** Money value of the lost hours; null when no rate is known. */
  value: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const summarizeWorkerDeleteImpact = (
  entries: readonly WorkerDeleteImpactEntry[],
  workerId: string,
  options?: { hourlyRate?: number | null; knownCost?: number | null },
): WorkerDeleteImpact => {
  const mine = entries.filter((e) => e.worker_id === workerId);
  const hours = round2(mine.reduce((sum, e) => sum + (Number(e.actual_hours) || 0), 0));

  if (mine.length === 0) {
    return { entryCount: 0, hours: 0, value: null };
  }

  const knownCost = options?.knownCost;
  if (typeof knownCost === 'number' && Number.isFinite(knownCost) && knownCost > 0) {
    return { entryCount: mine.length, hours, value: round2(knownCost) };
  }

  const rate = options?.hourlyRate;
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
    return { entryCount: mine.length, hours, value: round2(hours * rate) };
  }

  return { entryCount: mine.length, hours, value: null };
};
