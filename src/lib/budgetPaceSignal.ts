/**
 * Budget "pace" signal — čisti izračun (bez I/O) koji koristi i klijent (za test-mirror)
 * i edge funkcija check-budget-alerts (duplirana logika u Deno kontekstu).
 *
 * Semantika (v1, dogovor 9.7.2026):
 * - Ulaz: potrošeno / okvir plana (na razini plana, NE po kategorijama),
 *   startDate/endDate perioda, nowDate.
 * - Prag: (spentPct - elapsedPct) >= threshold (default 20 pp).
 * - Čuvar: signal se NE računa prije 3. dana perioda (elapsedDays < 3 → shouldSignal=false).
 * - Signal je ČINJENIČAN: ne tvrdi odstupanje od namjere; samo javlja da je potrošnja
 *   ispred linearnog tempa perioda.
 * - Kategorije v1 nemaju pace signal (fiksni troškovi prirodno troše nelinearno).
 */

export interface PaceSignalInput {
  spent: number;
  totalAmount: number;
  startDate: Date;
  endDate: Date;
  now: Date;
  /** Prag u postotnim bodovima; default 20. */
  thresholdPp?: number;
  /** Minimalno dana od početka perioda; default 3. */
  minElapsedDays?: number;
}

export interface PaceSignalResult {
  shouldSignal: boolean;
  spentPct: number;
  elapsedPct: number;
  elapsedDays: number;
  gapPp: number;
  reason: "before_min_days" | "invalid_input" | "below_threshold" | "signal";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeBudgetPaceSignal(input: PaceSignalInput): PaceSignalResult {
  const {
    spent,
    totalAmount,
    startDate,
    endDate,
    now,
    thresholdPp = 20,
    minElapsedDays = 3,
  } = input;

  const zero: PaceSignalResult = {
    shouldSignal: false,
    spentPct: 0,
    elapsedPct: 0,
    elapsedDays: 0,
    gapPp: 0,
    reason: "invalid_input",
  };

  if (!(totalAmount > 0)) return zero;
  const totalMs = endDate.getTime() - startDate.getTime();
  if (!(totalMs > 0)) return zero;
  if (now.getTime() < startDate.getTime() || now.getTime() > endDate.getTime()) return zero;

  const elapsedMs = now.getTime() - startDate.getTime();
  const elapsedDays = elapsedMs / DAY_MS;
  const elapsedPct = (elapsedMs / totalMs) * 100;
  const spentPct = (spent / totalAmount) * 100;
  const gapPp = spentPct - elapsedPct;

  if (elapsedDays < minElapsedDays) {
    return {
      shouldSignal: false,
      spentPct,
      elapsedPct,
      elapsedDays,
      gapPp,
      reason: "before_min_days",
    };
  }

  if (gapPp < thresholdPp) {
    return {
      shouldSignal: false,
      spentPct,
      elapsedPct,
      elapsedDays,
      gapPp,
      reason: "below_threshold",
    };
  }

  return {
    shouldSignal: true,
    spentPct,
    elapsedPct,
    elapsedDays,
    gapPp,
    reason: "signal",
  };
}

/**
 * Neusmjereno = okvir − Σ(planirani smjerovi). Može biti negativno (preko okvira).
 * Vrijednosti u istoj valuti/jedinici kao okvir.
 */
export function computeFrameAllocation(totalAmount: number, plannedByDirection: number[]): {
  totalAllocated: number;
  unallocated: number;
  overFrame: number;
  isOverFrame: boolean;
} {
  const totalAllocated = plannedByDirection.reduce((s, v) => s + (Number(v) || 0), 0);
  const diff = (Number(totalAmount) || 0) - totalAllocated;
  return {
    totalAllocated,
    unallocated: diff > 0 ? diff : 0,
    overFrame: diff < 0 ? -diff : 0,
    isOverFrame: diff < 0,
  };
}
