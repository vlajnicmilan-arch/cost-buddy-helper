import { describe, it, expect } from 'vitest';
import {
  calculateProjectSpent,
  calculateProjectIncomeFromTransactions,
  calculateProjectBalance,
  calculateCollectionProgress,
  calculateRemainingToCollect,
  calculateFundingTotal,
  type RawProjectExpense,
} from '../projectCalculations';
import { computeProjectProfitLoss } from '../projectProfitLoss';

/**
 * F1–F6 acceptance: a single project with advance + final invoice + transfer +
 * correction + pending must produce identical Spent / Income on every surface
 * (Budget tab, P&L, Forecast, Reports, Complete wizard). Funding stays outside.
 */
describe('F1–F6 acceptance: unified spent/income across all surfaces', () => {
  const txs: RawProjectExpense[] = [
    // Approved advance linked to a final invoice → must NOT double-count.
    { id: 'adv', amount: 500, type: 'expense', status: 'approved', is_advance: true },
    { id: 'inv', amount: 3640, type: 'expense', status: 'approved', linked_advance_ids: ['adv'] },
    // Approved income.
    { id: 'in1', amount: 2000, type: 'income', status: 'approved' },
    // Transfer between phases — excluded everywhere.
    { id: 'tr', amount: 9999, type: 'transfer', status: 'approved' },
    // Manual correction — excluded everywhere.
    { id: 'cor', amount: 9999, type: 'expense', status: 'approved', expense_nature: 'correction' },
    // Pending — excluded everywhere.
    { id: 'pend-e', amount: 100, type: 'expense', status: 'pending' },
    { id: 'pend-i', amount: 100, type: 'income', status: 'pending' },
  ];
  const expectedSpent = 3140; // 0 (advance consumed) + 3140 (invoice net)
  const expectedIncome = 2000;

  it('Spent identical via calculateProjectSpent and computeProjectProfitLoss', () => {
    expect(calculateProjectSpent(txs)).toBe(expectedSpent);
    const pl = computeProjectProfitLoss({
      project: { contract_value: 5000, total_budget: 5000 },
      transactions: txs,
      workEntries: [],
      workers: [],
      collaborators: [],
    });
    expect(pl.totalExpenses).toBe(expectedSpent);
  });

  it('Income identical and never includes funding (Option A)', () => {
    expect(calculateProjectIncomeFromTransactions(txs)).toBe(expectedIncome);
    const pl = computeProjectProfitLoss({
      project: { contract_value: 5000, total_budget: 5000 },
      transactions: txs,
      workEntries: [],
      workers: [],
      collaborators: [],
    });
    expect(pl.totalIncome).toBe(expectedIncome);
    expect(calculateProjectBalance(txs)).toBe(expectedIncome - expectedSpent);
  });

  it('Funding is a separate KPI (Planirano) — never folded into income/collection', () => {
    const funding = [{ allocated_amount: 10_000 }];
    expect(calculateFundingTotal(funding)).toBe(10_000);
    // Even with funding present, collection % uses ONLY realized income.
    expect(
      calculateCollectionProgress({ contract_value: 5000, total_budget: 5000 }, txs)
    ).toBe(40); // 2000 / 5000
    expect(
      calculateRemainingToCollect({ contract_value: 5000, total_budget: 5000 }, txs)
    ).toBe(3000);
  });
});

describe('F2 (P&L) — filter alignment', () => {
  it('ignores transfer / correction / pending in income and expense totals', () => {
    const pl = computeProjectProfitLoss({
      project: { contract_value: 1000, total_budget: null },
      transactions: [
        { type: 'income', amount: 300, status: 'approved' },
        { type: 'income', amount: 50, status: 'pending' },
        { type: 'expense', amount: 100, status: 'approved' },
        { type: 'expense', amount: 100, status: 'approved', expense_nature: 'correction' },
        { type: 'transfer', amount: 9999, status: 'approved' },
        { type: 'expense', amount: 100, status: 'rejected' },
      ],
      workEntries: [],
      workers: [],
      collaborators: [],
    });
    expect(pl.totalIncome).toBe(300);
    expect(pl.totalExpenses).toBe(100);
  });

  it('applies advance/invoice netting in totalExpenses', () => {
    const pl = computeProjectProfitLoss({
      project: null,
      transactions: [
        { id: 'a1', type: 'expense', amount: 500, status: 'approved', is_advance: true },
        { id: 'inv', type: 'expense', amount: 3640, status: 'approved', linked_advance_ids: ['a1'] },
      ],
      workEntries: [],
      workers: [],
      collaborators: [],
    });
    expect(pl.totalExpenses).toBe(3140);
  });
});
