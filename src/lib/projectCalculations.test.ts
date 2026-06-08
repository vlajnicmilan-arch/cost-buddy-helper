import { describe, it, expect } from 'vitest';
import {
  calculateProjectSpent,
  calculateProjectIncomeFromTransactions,
  calculateProjectBalance,
  calculateProjectProgress,
  calculateNetExpenseAmount,
  calculateContractValue,
  calculateExpectedProfit,
  calculateCollectionProgress,
  calculateRemainingToCollect,
  calculateFundingTotal,
  RawProjectExpense,
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

describe('calculateProjectBalance (Option A: funding NOT in income)', () => {
  it('returns 0 with no data', () => {
    expect(calculateProjectBalance([])).toBe(0);
  });

  it('balance = realized income − spent (funding excluded)', () => {
    const txs = [exp({ amount: 100 }), exp({ type: 'income', amount: 200 })];
    expect(calculateProjectBalance(txs)).toBe(100); // 200 − 100
  });

  it('funding rows are not consumed (separate KPI)', () => {
    // calculateFundingTotal is the public way to read planned funding.
    expect(calculateFundingTotal([{ allocated_amount: 500 }])).toBe(500);
    expect(calculateProjectBalance([])).toBe(0);
  });

  it('excludes pending/transfer/correction from balance', () => {
    const txs = [
      exp({ amount: 100 }),
      exp({ amount: 50, status: 'pending' }),
      exp({ type: 'transfer', amount: 999 }),
      exp({ amount: 999, expense_nature: 'correction' }),
      exp({ type: 'income', amount: 999, expense_nature: 'correction' }),
      exp({ type: 'income', amount: 999, status: 'pending' }),
    ];
    expect(calculateProjectBalance(txs)).toBe(-100);
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

describe('calculateNetExpenseAmount — advance/invoice netting', () => {
  it('returns raw amount when no advances are linked', () => {
    const e = exp({ id: 'x', amount: 100 });
    expect(calculateNetExpenseAmount(e, [e])).toBe(100);
  });

  it('linked advance returns 0 (consumed by final invoice)', () => {
    const advance = exp({ id: 'a1', amount: 500, is_advance: true });
    const invoice = exp({ id: 'inv', amount: 3640, linked_advance_ids: ['a1'] });
    expect(calculateNetExpenseAmount(advance, [advance, invoice])).toBe(0);
  });

  it('unlinked advance still counts at full amount', () => {
    const advance = exp({ id: 'a1', amount: 500, is_advance: true });
    expect(calculateNetExpenseAmount(advance, [advance])).toBe(500);
  });

  it('invoice subtracts linked advance sum', () => {
    const advance = exp({ id: 'a1', amount: 500, is_advance: true });
    const invoice = exp({ id: 'inv', amount: 3640, linked_advance_ids: ['a1'] });
    expect(calculateNetExpenseAmount(invoice, [advance, invoice])).toBe(3140);
  });

  it('invoice never goes below 0 even when advances exceed it', () => {
    const a1 = exp({ id: 'a1', amount: 1000, is_advance: true });
    const a2 = exp({ id: 'a2', amount: 1000, is_advance: true });
    const invoice = exp({ id: 'inv', amount: 1500, linked_advance_ids: ['a1', 'a2'] });
    expect(calculateNetExpenseAmount(invoice, [a1, a2, invoice])).toBe(0);
  });

  it('ignores linked ids that are not advances or are missing', () => {
    const invoice = exp({ id: 'inv', amount: 3640, linked_advance_ids: ['missing'] });
    expect(calculateNetExpenseAmount(invoice, [invoice])).toBe(3640);
  });

  it('full project sum: advance + invoice nets correctly (no double-count)', () => {
    // advance(linked)=0 + invoice(3640-500)=3140 → total 3140 (not 4140)
    const advance = exp({ id: 'a1', amount: 500, is_advance: true });
    const invoice = exp({ id: 'inv', amount: 3640, linked_advance_ids: ['a1'] });
    expect(calculateProjectSpent([advance, invoice])).toBe(3140);
  });
});


describe('calculateContractValue', () => {
  it('returns 0 for null/undefined project', () => {
    expect(calculateContractValue(null)).toBe(0);
    expect(calculateContractValue(undefined)).toBe(0);
  });

  it('prefers contract_value when > 0', () => {
    expect(calculateContractValue({ contract_value: 10000, total_budget: 5000 })).toBe(10000);
  });

  it('falls back to total_budget when contract_value is 0/null', () => {
    expect(calculateContractValue({ contract_value: 0, total_budget: 5000 })).toBe(5000);
    expect(calculateContractValue({ contract_value: null, total_budget: 5000 })).toBe(5000);
  });

  it('returns 0 when both are missing', () => {
    expect(calculateContractValue({})).toBe(0);
  });

  it('handles string values', () => {
    expect(calculateContractValue({ contract_value: '7500.5' })).toBe(7500.5);
  });
});

describe('calculateExpectedProfit', () => {
  it('contract − spent', () => {
    const txs = [exp({ amount: 300 }), exp({ amount: 200 })];
    expect(calculateExpectedProfit({ contract_value: 1000 }, txs)).toBe(500);
  });

  it('can be negative when costs exceed contract', () => {
    expect(calculateExpectedProfit({ contract_value: 100 }, [exp({ amount: 500 })])).toBe(-400);
  });

  it('returns -spent when project is null', () => {
    expect(calculateExpectedProfit(null, [exp({ amount: 50 })])).toBe(-50);
  });
});

describe('calculateCollectionProgress (Option A: funding NOT counted as collected)', () => {
  it('returns 0 when contract is 0', () => {
    expect(calculateCollectionProgress({ contract_value: 0 }, [])).toBe(0);
  });

  it('returns 0 for null project', () => {
    expect(calculateCollectionProgress(null, [])).toBe(0);
  });

  it('percentage of realized income vs contract', () => {
    const txs = [exp({ type: 'income', amount: 250 })];
    expect(calculateCollectionProgress({ contract_value: 1000 }, txs)).toBe(25);
  });

  it('caps at 100', () => {
    const txs = [exp({ type: 'income', amount: 2000 })];
    expect(calculateCollectionProgress({ contract_value: 1000 }, txs)).toBe(100);
  });

  it('funding does NOT count as collected', () => {
    // Only realized income matters; funding is "Planirano", not "Naplaćeno".
    expect(calculateCollectionProgress({ contract_value: 1000 }, [])).toBe(0);
  });

  it('excludes pending/correction income from collection', () => {
    const txs = [
      exp({ type: 'income', amount: 250 }),
      exp({ type: 'income', amount: 500, status: 'pending' }),
      exp({ type: 'income', amount: 999, expense_nature: 'correction' }),
    ];
    expect(calculateCollectionProgress({ contract_value: 1000 }, txs)).toBe(25);
  });
});

describe('calculateRemainingToCollect (Option A)', () => {
  it('contract − realized income', () => {
    const txs = [exp({ type: 'income', amount: 300 })];
    expect(calculateRemainingToCollect({ contract_value: 1000 }, txs)).toBe(700);
  });

  it('never negative', () => {
    const txs = [exp({ type: 'income', amount: 5000 })];
    expect(calculateRemainingToCollect({ contract_value: 1000 }, txs)).toBe(0);
  });

  it('returns contract when nothing collected', () => {
    expect(calculateRemainingToCollect({ contract_value: 1000 }, [])).toBe(1000);
  });

  it('handles null project gracefully', () => {
    expect(calculateRemainingToCollect(null, [])).toBe(0);
  });
});

