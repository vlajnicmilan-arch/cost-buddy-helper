import { describe, it, expect } from 'vitest';
import { computeProfitTrend } from '@/lib/profitTrend';

describe('computeProfitTrend', () => {
  it('returns null percent when previous profit is 0 (no division by zero)', () => {
    expect(computeProfitTrend(500, 0)).toEqual({ percent: null, direction: 'up' });
    expect(computeProfitTrend(-500, 0)).toEqual({ percent: null, direction: 'down' });
    expect(computeProfitTrend(0, 0)).toEqual({ percent: null, direction: 'flat' });
  });

  it('computes normal positive growth', () => {
    expect(computeProfitTrend(150, 100)).toEqual({ percent: 50, direction: 'up' });
  });

  it('computes decline', () => {
    expect(computeProfitTrend(50, 100)).toEqual({ percent: -50, direction: 'down' });
  });

  it('uses absolute previous profit so recovery from a loss reads as positive', () => {
    expect(computeProfitTrend(0, -100)).toEqual({ percent: 100, direction: 'up' });
    expect(computeProfitTrend(-50, -100)).toEqual({ percent: 50, direction: 'up' });
    expect(computeProfitTrend(-200, -100)).toEqual({ percent: -100, direction: 'down' });
  });

  it('is flat when nothing changed', () => {
    expect(computeProfitTrend(100, 100)).toEqual({ percent: 0, direction: 'flat' });
  });

  it('guards against non-finite input', () => {
    expect(computeProfitTrend(NaN, 100)).toEqual({ percent: -100, direction: 'down' });
    expect(computeProfitTrend(100, NaN)).toEqual({ percent: null, direction: 'up' });
  });
});
