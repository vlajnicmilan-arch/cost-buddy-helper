import { describe, it, expect } from 'vitest';
import {
  calculateProjectSpent,
  calculateProjectIncomeFromTransactions,
  calculateProjectBalance,
  calculateProjectProgress,
  RawProjectExpense,
  RawFundingRow,
} from './projectCalculations';

const exp = (over: Partial<RawProjectExpense> = {}): RawProjectExpense => ({
  amount: 100,
  type: 'expense',
  status: 'approved',
  expense_nature: null,
  ...over,
});

describe('calculateProjectSpent', () => {
  it('returns 0 for empty array', () => {
    expect(calculateProjectSpent([])).toBe(0);
  });

  it('sums approved expense rows', () => {
    expect(
      calculateProjectSpent([exp({ amount: 100 }), exp({ amount: 50 }), exp({ amount: '25.5' })])
    ).toBe(175.5);
  });

  it('ignores income rows', () => {
    expect(
      calculateProjectSpent([exp({ amount: 100 }), exp({ type: 'income', amount: 999 })])
    ).toBe(100);
  });

  it('ignores transfer rows', () => {
    expect(
      calculateProjectSpent([exp({ amount: 100 }), exp({ type: 'transfer', amount: 999 })])
    ).toBe(100);
  });

  it('ignores correction rows', () => {
    expect(
      calculateProjectSpent([exp({ amount: 100 }), exp({ amount: 999, expense_nature: 'correction' })])
    ).toBe(100);
  });

  it('ignores pending and rejected rows', () => {
    expect(
      calculateProjectSpent([
        exp({ amount: 100 }),
        exp({ amount: 50, status: 'pending' }),
        exp({ amount: 50, status: 'rejected' }),
      ])
    ).toBe(100);
  });

  it('treats null status as approved', () => {
    expect(calculateProjectSpent([exp({ amount: 100, status: null })])).toBe(100);
  });

  it('handles zero amounts', () => {
    expect(calculateProjectSpent([exp({ amount: 0 }), exp({ amount: 50 })])).toBe(50);
  });

  it('handles negative amounts (sums them as-is)', () => {
    expect(calculateProjectSpent([exp({ amount: -30 }), exp({ amount: 100 })])).toBe(70);
  });
});

describe('calculateProjectIncomeFromTransactions', () => {
  it('returns 0 for empty array', () => {
    expect(calculateProjectIncomeFromTransactions([])).toBe(0);
  });

  it('sums approved income only', () => {
    expect(
      calculateProjectIncomeFromTransactions([
        exp({ type: 'income', amount: 200 }),
        exp({ type: 'income', amount: 50 }),
        exp({ amount: 999 }),
      ])
    ).toBe(250);
  });

  it('ignores transfers and corrections in income', () => {
    expect(
      calculateProjectIncomeFromTransactions([
        exp({ type: 'income', amount: 100 }),
        exp({ type: 'transfer', amount: 500 }),
        exp({ type: 'income', amount: 999, expense_nature: 'correction' }),
      ])
    ).toBe(100);
  });

  it('ignores pending income', () => {
    expect(
      calculateProjectIncomeFromTransactions([
        exp({ type: 'income', amount: 100 }),
        exp({ type: 'income', amount: 50, status: 'pending' }),
      ])
    ).toBe(100);
  });

  it('handles negative amounts', () => {
    expect(
      calculateProjectIncomeFromTransactions([
        exp({ type: 'income', amount: -20 }),
        exp({ type: 'income', amount: 100 }),
      ])
    ).toBe(80);
  });
});

describe('calculateProjectBalance', () => {
  const funding: RawFundingRow[] = [{ allocated_amount: 500 }];

  it('returns 0 with no data', () => {
    expect(calculateProjectBalance([], [])).toBe(0);
  });

  it('balance = income (tx + funding) − spent', () => {
    const txs = [exp({ amount: 100 }), exp({ type: 'income', amount: 200 })];
    expect(calculateProjectBalance(txs, funding)).toBe(600); // 200 + 500 - 100
  });

  it('handles funding only', () => {
    expect(calculateProjectBalance([], funding)).toBe(500);
  });

  it('excludes pending/transfer/correction from balance', () => {
    const txs = [
      exp({ amount: 100 }),
      exp({ amount: 50, status: 'pending' }),
      exp({ type: 'transfer', amount: 999 }),
      exp({ amount: 999, expense_nature: 'correction' }),
    ];
    expect(calculateProjectBalance(txs, [])).toBe(-100);
  });

  it('handles null funding amounts', () => {
    expect(calculateProjectBalance([], [{ allocated_amount: null }])).toBe(0);
  });
});

describe('calculateProjectProgress', () => {
  it('returns 0 when budget is 0', () => {
    expect(calculateProjectProgress(50, 0)).toBe(0);
  });

  it('returns 0 when budget is negative', () => {
    expect(calculateProjectProgress(50, -100)).toBe(0);
  });

  it('returns correct percentage', () => {
    expect(calculateProjectProgress(50, 200)).toBe(25);
  });

  it('caps at 100', () => {
    expect(calculateProjectProgress(500, 200)).toBe(100);
  });

  it('returns 0 when spent is 0', () => {
    expect(calculateProjectProgress(0, 200)).toBe(0);
  });
});
