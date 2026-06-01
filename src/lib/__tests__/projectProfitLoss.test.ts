import { describe, it, expect } from 'vitest';
import { computeProjectProfitLoss, type PLInput } from '../projectProfitLoss';

const empty: PLInput = {
  project: null,
  transactions: [],
  workEntries: [],
  workers: [],
  collaborators: [],
};

describe('computeProjectProfitLoss — contract value resolution', () => {
  it('uses contract_value when > 0', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      project: { contract_value: 10000, total_budget: 5000 },
    });
    expect(r.contractValue).toBe(10000);
  });

  it('falls back to total_budget when contract_value is 0', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      project: { contract_value: 0, total_budget: 5000 },
    });
    expect(r.contractValue).toBe(5000);
  });

  it('falls back to total_budget when contract_value is null', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      project: { contract_value: null, total_budget: 7500 },
    });
    expect(r.contractValue).toBe(7500);
  });

  it('returns 0 when both are missing', () => {
    const r = computeProjectProfitLoss({ ...empty, project: null });
    expect(r.contractValue).toBe(0);
  });

  it('parses string numbers from Supabase numeric columns', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      project: { contract_value: '12345.67', total_budget: null },
    });
    expect(r.contractValue).toBeCloseTo(12345.67);
  });

  it('falls back when contract_value is negative', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      project: { contract_value: -50, total_budget: 1000 },
    });
    expect(r.contractValue).toBe(1000);
  });
});

describe('computeProjectProfitLoss — income & expenses', () => {
  it('sums income and expense by type, ignores transfers/other', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      transactions: [
        { type: 'income', amount: 100 },
        { type: 'income', amount: 250 },
        { type: 'expense', amount: 50 },
        { type: 'transfer', amount: 999 },
        { type: 'correction', amount: 999 },
      ],
    });
    expect(r.totalIncome).toBe(350);
    expect(r.totalExpenses).toBe(50);
  });

  it('treats null/invalid amounts as 0', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      transactions: [
        { type: 'income', amount: null },
        { type: 'expense', amount: 'abc' as any },
        { type: 'income', amount: '42.5' },
      ],
    });
    expect(r.totalIncome).toBe(42.5);
    expect(r.totalExpenses).toBe(0);
  });
});

describe('computeProjectProfitLoss — labor', () => {
  it('applies per-worker rates and sums hours across entries', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      workers: [
        { id: 'w1', first_name: 'Ana', last_name: 'A', hourly_rate: 20 },
        { id: 'w2', first_name: 'Bob', last_name: 'B', hourly_rate: 30 },
      ],
      workEntries: [
        { worker_id: 'w1', actual_hours: 5 },
        { worker_id: 'w1', actual_hours: 3 },
        { worker_id: 'w2', actual_hours: 2 },
      ],
    });
    expect(r.laborCost).toBe(8 * 20 + 2 * 30); // 160 + 60 = 220
    expect(r.workers).toHaveLength(2);
    expect(r.workers.find((w) => w.id === 'w1')).toMatchObject({
      name: 'Ana A',
      hours: 8,
      rate: 20,
      cost: 160,
    });
  });

  it('omits workers with 0 hours from details but keeps cost = 0', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      workers: [
        { id: 'w1', first_name: 'Ana', last_name: 'A', hourly_rate: 20 },
        { id: 'w2', first_name: 'Idle', last_name: 'X', hourly_rate: 30 },
      ],
      workEntries: [{ worker_id: 'w1', actual_hours: 4 }],
    });
    expect(r.workers).toHaveLength(1);
    expect(r.workers[0].id).toBe('w1');
    expect(r.laborCost).toBe(80);
  });

  it('ignores entries with unknown worker_id', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      workers: [{ id: 'w1', first_name: 'Ana', last_name: 'A', hourly_rate: 20 }],
      workEntries: [
        { worker_id: 'w1', actual_hours: 2 },
        { worker_id: 'ghost', actual_hours: 99 },
      ],
    });
    expect(r.laborCost).toBe(40);
  });

  it('handles string hours and rates', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      workers: [{ id: 'w1', first_name: 'Ana', last_name: 'A', hourly_rate: '15.5' as any }],
      workEntries: [{ worker_id: 'w1', actual_hours: '4' as any }],
    });
    expect(r.laborCost).toBeCloseTo(62);
  });
});

describe('computeProjectProfitLoss — collaborators (cash basis)', () => {
  it('uses paid_amount, not total_price', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      collaborators: [
        { id: 'c1', first_name: 'Sub', last_name: 'One', total_price: 5000, paid_amount: 2000 },
        { id: 'c2', first_name: 'Sub', last_name: 'Two', total_price: 1000, paid_amount: 0 },
      ],
    });
    expect(r.collaboratorCost).toBe(2000);
    expect(r.collaborators).toHaveLength(2);
    expect(r.collaborators[0]).toMatchObject({ totalPrice: 5000, paidAmount: 2000 });
  });
});

describe('computeProjectProfitLoss — material derivation', () => {
  it('material = expenses - labor - collaborator paid', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      transactions: [{ type: 'expense', amount: 1000 }],
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 20 }],
      workEntries: [{ worker_id: 'w1', actual_hours: 10 }], // 200
      collaborators: [
        { id: 'c1', first_name: 'X', last_name: 'Y', total_price: 0, paid_amount: 300 },
      ],
    });
    expect(r.materialCost).toBe(500);
  });

  it('material is floored at 0 when labor+collab exceed expenses', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      transactions: [{ type: 'expense', amount: 100 }],
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 50 }],
      workEntries: [{ worker_id: 'w1', actual_hours: 10 }], // 500
    });
    expect(r.materialCost).toBe(0);
  });
});

describe('computeProjectProfitLoss — cash view (margin)', () => {
  it('netProfit = income - (labor+collab+material), margin in percent', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      transactions: [
        { type: 'income', amount: 2000 },
        { type: 'expense', amount: 800 },
      ],
      workers: [{ id: 'w1', first_name: 'A', last_name: 'B', hourly_rate: 10 }],
      workEntries: [{ worker_id: 'w1', actual_hours: 20 }], // 200
      collaborators: [
        { id: 'c1', first_name: 'X', last_name: 'Y', total_price: 0, paid_amount: 100 },
      ],
    });
    // material = max(0, 800 - 200 - 100) = 500
    // total costs = 200 + 100 + 500 = 800
    expect(r.netProfit).toBe(1200);
    expect(r.margin).toBe(60);
  });

  it('margin = 0 when income = 0 (no divide-by-zero)', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      transactions: [{ type: 'expense', amount: 100 }],
    });
    expect(r.margin).toBe(0);
    expect(r.netProfit).toBe(-100);
  });
});

describe('computeProjectProfitLoss — accrual view (contract)', () => {
  it('expectedProfit & expectedMargin use contractValue', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      project: { contract_value: 10000, total_budget: null },
      transactions: [{ type: 'expense', amount: 4000 }],
    });
    // costs = 4000 (all material), expected = 10000 - 4000
    expect(r.expectedProfit).toBe(6000);
    expect(r.expectedMargin).toBe(60);
  });

  it('expectedMargin = 0 when contractValue = 0', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      transactions: [{ type: 'expense', amount: 100 }],
    });
    expect(r.expectedMargin).toBe(0);
    expect(r.expectedProfit).toBe(-100); // contract 0 - costs 100
  });

  it('collectedPercentage capped at 100 when overcollected', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      project: { contract_value: 1000, total_budget: null },
      transactions: [{ type: 'income', amount: 2500 }],
    });
    expect(r.collectedPercentage).toBe(100);
    expect(r.remainingToCollect).toBe(0);
  });

  it('collectedPercentage proportional when partial', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      project: { contract_value: 1000, total_budget: null },
      transactions: [{ type: 'income', amount: 250 }],
    });
    expect(r.collectedPercentage).toBe(25);
    expect(r.remainingToCollect).toBe(750);
  });

  it('collectedPercentage = 0 and remaining = 0 when no contract', () => {
    const r = computeProjectProfitLoss({
      ...empty,
      transactions: [{ type: 'income', amount: 500 }],
    });
    expect(r.collectedPercentage).toBe(0);
    expect(r.remainingToCollect).toBe(0);
  });
});

describe('computeProjectProfitLoss — empty / null safety', () => {
  it('returns all zeros on fully empty input', () => {
    const r = computeProjectProfitLoss(empty);
    expect(r).toMatchObject({
      totalIncome: 0,
      totalExpenses: 0,
      laborCost: 0,
      collaboratorCost: 0,
      materialCost: 0,
      netProfit: 0,
      margin: 0,
      contractValue: 0,
      expectedProfit: 0,
      expectedMargin: 0,
      collectedPercentage: 0,
      remainingToCollect: 0,
    });
    expect(r.workers).toEqual([]);
    expect(r.collaborators).toEqual([]);
  });

  it('handles null arrays without throwing', () => {
    const r = computeProjectProfitLoss({
      project: null,
      transactions: null,
      workEntries: null,
      workers: null,
      collaborators: null,
    });
    expect(r.totalIncome).toBe(0);
  });
});
