import { describe, it, expect } from 'vitest';
import {
  rateAtLocal,
  computeWorkerCostTotals,
  type RateHistoryRow,
  type WorkEntryForCost,
} from '../workerRateHistory';

const W = 'worker-1';

const history: RateHistoryRow[] = [
  { worker_id: W, rate: 20, effective_from: '2026-01-01' },
  { worker_id: W, rate: 25, effective_from: '2026-06-01' },
  { worker_id: W, rate: 30, effective_from: '2026-09-01' },
];

describe('rateAtLocal', () => {
  it('returns row with greatest effective_from <= date', () => {
    expect(rateAtLocal(history, W, '2026-05-31', 0)).toBe(20);
    expect(rateAtLocal(history, W, '2026-06-01', 0)).toBe(25);
    expect(rateAtLocal(history, W, '2026-08-31', 0)).toBe(25);
    expect(rateAtLocal(history, W, '2026-09-01', 0)).toBe(30);
    expect(rateAtLocal(history, W, '2027-05-01', 0)).toBe(30);
  });

  it('returns fallback when no row matches (date before earliest)', () => {
    expect(rateAtLocal(history, W, '2025-12-31', 99)).toBe(99);
  });

  it('returns fallback when worker unknown', () => {
    expect(rateAtLocal(history, 'other', '2026-06-01', 42)).toBe(42);
  });

  it('is not confused by mixed workers in history', () => {
    const mixed: RateHistoryRow[] = [
      ...history,
      { worker_id: 'w2', rate: 100, effective_from: '2026-06-01' },
    ];
    expect(rateAtLocal(mixed, W, '2026-06-01', 0)).toBe(25);
    expect(rateAtLocal(mixed, 'w2', '2026-06-01', 0)).toBe(100);
  });
});

describe('computeWorkerCostTotals', () => {
  it('splits cost across rate segments and separates remaining vs paid', () => {
    const entries: WorkEntryForCost[] = [
      { worker_id: W, work_date: '2026-05-15', actual_hours: 8, payout_id: 'p1' }, // 8*20=160 paid
      { worker_id: W, work_date: '2026-06-05', actual_hours: 4, payout_id: null }, // 4*25=100 remaining
      { worker_id: W, work_date: '2026-09-10', actual_hours: 6, payout_id: null }, // 6*30=180 remaining
    ];
    const now = new Date('2026-09-15T12:00:00Z');
    const t = computeWorkerCostTotals(entries, history, { [W]: 0 }, now)[W];
    expect(t.totalHours).toBe(18);
    expect(t.totalCost).toBe(160 + 100 + 180);
    expect(t.remainingHours).toBe(10);
    expect(t.remainingCost).toBe(100 + 180);
    expect(t.currentMonthHours).toBe(6); // Sep 2026
    expect(t.currentMonthCost).toBe(180);
  });

  it('falls back to worker fallback rate when history is empty', () => {
    const entries: WorkEntryForCost[] = [
      { worker_id: W, work_date: '2026-06-05', actual_hours: 3 },
    ];
    const t = computeWorkerCostTotals(entries, [], { [W]: 15 })[W];
    expect(t.totalCost).toBe(45);
  });
});
