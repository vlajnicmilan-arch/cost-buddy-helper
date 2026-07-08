import { describe, it, expect, vi } from 'vitest';
import { computeProjectLaborCost, rateAtFromHistory } from '../projectLaborCost';

describe('computeProjectLaborCost — historical rate_at', () => {
  it('applies a single rate when the worker has no rate promjena', () => {
    const r = computeProjectLaborCost({
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 20 }],
      workEntries: [
        { worker_id: 'w1', actual_hours: 4, work_date: '2026-01-10' },
        { worker_id: 'w1', actual_hours: 6, work_date: '2026-01-20' },
      ],
      rateHistory: [
        { worker_id: 'w1', rate: 20, effective_from: '2026-01-01' },
      ],
    });
    expect(r.laborCost).toBe(200); // 10h * 20
    expect(r.workerDetails).toHaveLength(1);
    expect(r.workerDetails[0]).toMatchObject({ id: 'w1', hours: 10, cost: 200 });
    expect(r.missingHistoryWorkerIds).toEqual([]);
  });

  it('applies per-day rate when the rate changes mid-period', () => {
    // First half of month = 20/h, second half = 30/h.
    const r = computeProjectLaborCost({
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 30 }],
      workEntries: [
        { worker_id: 'w1', actual_hours: 5, work_date: '2026-01-05' }, // 20 = 100
        { worker_id: 'w1', actual_hours: 5, work_date: '2026-01-14' }, // 20 = 100
        { worker_id: 'w1', actual_hours: 5, work_date: '2026-01-15' }, // 30 = 150
        { worker_id: 'w1', actual_hours: 5, work_date: '2026-01-20' }, // 30 = 150
      ],
      rateHistory: [
        { worker_id: 'w1', rate: 20, effective_from: '2026-01-01' },
        { worker_id: 'w1', rate: 30, effective_from: '2026-01-15' },
      ],
    });
    expect(r.laborCost).toBe(500);
    // Effective avg rate = cost / hours = 500 / 20 = 25
    expect(r.workerDetails[0].rate).toBe(25);
    expect(r.workerDetails[0].hours).toBe(20);
  });

  it('falls back to worker.hourly_rate when a worker has no history rows and tracks the miss', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = computeProjectLaborCost({
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 15 }],
      workEntries: [
        { worker_id: 'w1', actual_hours: 4, work_date: '2026-01-10' },
      ],
      rateHistory: [],
    });
    expect(r.laborCost).toBe(60);
    expect(r.missingHistoryWorkerIds).toEqual(['w1']);
    warn.mockRestore();
  });

  it('falls back when the entry date is BEFORE the earliest history row', () => {
    const r = computeProjectLaborCost({
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 12 }],
      workEntries: [
        { worker_id: 'w1', actual_hours: 3, work_date: '2025-12-31' },
      ],
      rateHistory: [
        { worker_id: 'w1', rate: 25, effective_from: '2026-01-01' },
      ],
    });
    expect(r.laborCost).toBe(36); // 3 * 12 fallback
    expect(r.missingHistoryWorkerIds).toEqual(['w1']);
  });

  it('returns 0 laborCost when there are no work entries', () => {
    const r = computeProjectLaborCost({
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 20 }],
      workEntries: [],
      rateHistory: [
        { worker_id: 'w1', rate: 20, effective_from: '2026-01-01' },
      ],
    });
    expect(r.laborCost).toBe(0);
    expect(r.workerDetails).toEqual([]);
  });

  it('ignores entries for unknown worker_id (orphan)', () => {
    const r = computeProjectLaborCost({
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 20 }],
      workEntries: [
        { worker_id: 'ghost', actual_hours: 999, work_date: '2026-01-10' },
      ],
      rateHistory: [],
    });
    expect(r.laborCost).toBe(0);
    expect(r.workerDetails).toEqual([]);
  });

  it('handles string hours and rates', () => {
    const r = computeProjectLaborCost({
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: '10' }],
      workEntries: [
        { worker_id: 'w1', actual_hours: '2.5' as any, work_date: '2026-01-10' },
      ],
      rateHistory: [
        { worker_id: 'w1', rate: '18.50', effective_from: '2026-01-01' },
      ],
    });
    expect(r.laborCost).toBeCloseTo(46.25);
  });
});

describe('rateAtFromHistory (unit)', () => {
  const map = new Map();
  map.set('w1', [
    { worker_id: 'w1', rate: 30, effective_from: '2026-02-01' },
    { worker_id: 'w1', rate: 20, effective_from: '2026-01-01' },
  ]);

  it('picks the most recent effective_from <= date', () => {
    expect(rateAtFromHistory('w1', '2026-01-15', map)).toBe(20);
    expect(rateAtFromHistory('w1', '2026-02-01', map)).toBe(30);
    expect(rateAtFromHistory('w1', '2026-03-01', map)).toBe(30);
  });

  it('returns null when date is before earliest', () => {
    expect(rateAtFromHistory('w1', '2025-12-31', map)).toBeNull();
  });

  it('returns null when worker not in map', () => {
    expect(rateAtFromHistory('x', '2026-01-15', map)).toBeNull();
  });
});
