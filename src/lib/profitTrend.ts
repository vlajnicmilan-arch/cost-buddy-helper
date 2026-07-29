/**
 * Pure trend helper for the business dashboard profit section.
 *
 * Rules:
 *  - percent change is relative to the ABSOLUTE previous profit, so a swing
 *    from -100 to 0 reads as +100% (improvement), not -100%.
 *  - when previous profit is exactly 0 (or not finite) there is no meaningful
 *    base → return null so the UI can render "—" instead of Infinity/NaN.
 */

export interface ProfitTrend {
  /** Rounded percent change vs. previous period, or null when undefined. */
  percent: number | null;
  /** 'up' | 'down' | 'flat' — direction of the absolute profit change. */
  direction: 'up' | 'down' | 'flat';
}

export const computeProfitTrend = (
  currentProfit: number,
  previousProfit: number,
): ProfitTrend => {
  const cur = Number.isFinite(currentProfit) ? currentProfit : 0;
  const prev = Number.isFinite(previousProfit) ? previousProfit : 0;

  const delta = cur - prev;
  const direction: ProfitTrend['direction'] =
    delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  if (prev === 0) return { percent: null, direction };

  return { percent: Math.round((delta / Math.abs(prev)) * 100), direction };
};
