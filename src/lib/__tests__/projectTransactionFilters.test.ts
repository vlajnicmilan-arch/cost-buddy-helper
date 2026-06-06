import { describe, it, expect } from 'vitest';
import {
  filterProjectExpenses,
  computeProjectExpenseTotals,
  hasActiveProjectFilters,
  EMPTY_PROJECT_FILTER_STATE,
} from '../projectTransactionFilters';
import type { ProjectExpense, ProjectTransactionFilterState } from '../projectTransactionFilters';

const mk = (over: Partial<ProjectExpense>): ProjectExpense => ({
  id: over.id ?? 'x',
  user_id: 'u',
  amount: 100,
  description: 'desc',
  category: 'other',
  date: '2026-06-01T10:00:00Z',
  type: 'expense',
  ...over,
});

const baseState = (over: Partial<ProjectTransactionFilterState> = {}): ProjectTransactionFilterState => ({
  ...EMPTY_PROJECT_FILTER_STATE,
  ...over,
});

describe('filterProjectExpenses', () => {
  const sample: ProjectExpense[] = [
    mk({ id: '1', description: 'Cement', category: 'home', work_type: 'material', expense_nature: 'regular', milestone_id: 'm1', payment_source: 'custom:a', amount: 50 }),
    mk({ id: '2', description: 'Radnik Ivan', category: 'other', work_type: 'labor', expense_nature: 'regular', milestone_id: 'm2', payment_source: 'custom:b', amount: 200 }),
    mk({ id: '3', description: 'Bager najam', category: 'transport', work_type: 'equipment', expense_nature: 'extraordinary', milestone_id: null, payment_source: null, amount: 300 }),
    mk({ id: '4', description: 'Prihod faze', type: 'income', category: 'other', work_type: null, milestone_id: 'm1', amount: 1000 }),
  ];

  it('returns all when state is empty', () => {
    expect(filterProjectExpenses(sample, baseState())).toHaveLength(4);
  });

  it('searchTerm matches description case-insensitively', () => {
    const r = filterProjectExpenses(sample, baseState({ searchTerm: 'RADNIK' }));
    expect(r.map((e) => e.id)).toEqual(['2']);
  });

  it('filterMilestoneId=none keeps only rows without milestone', () => {
    const r = filterProjectExpenses(sample, baseState({ filterMilestoneId: 'none' }));
    expect(r.map((e) => e.id)).toEqual(['3']);
  });

  it('filterMilestoneId=<id> keeps matching milestone', () => {
    const r = filterProjectExpenses(sample, baseState({ filterMilestoneId: 'm1' }));
    expect(r.map((e) => e.id).sort()).toEqual(['1', '4']);
  });

  it('filterPaymentSource matches exact value', () => {
    const r = filterProjectExpenses(sample, baseState({ filterPaymentSource: 'custom:a' }));
    expect(r.map((e) => e.id)).toEqual(['1']);
  });

  it('filterExpenseNature=extraordinary filters', () => {
    const r = filterProjectExpenses(sample, baseState({ filterExpenseNature: 'extraordinary' }));
    expect(r.map((e) => e.id)).toEqual(['3']);
  });

  it('filterCategory filters by id', () => {
    const r = filterProjectExpenses(sample, baseState({ filterCategory: 'transport' }));
    expect(r.map((e) => e.id)).toEqual(['3']);
  });

  it('filterWorkType filters', () => {
    const r = filterProjectExpenses(sample, baseState({ filterWorkType: 'labor' }));
    expect(r.map((e) => e.id)).toEqual(['2']);
  });

  it('filterDateRange from-only and from-to inclusive', () => {
    const all = [
      mk({ id: 'a', date: '2026-05-30T00:00:00Z' }),
      mk({ id: 'b', date: '2026-06-01T12:00:00Z' }),
      mk({ id: 'c', date: '2026-06-05T23:00:00Z' }),
      mk({ id: 'd', date: '2026-06-10T00:00:00Z' }),
    ];
    const fromOnly = filterProjectExpenses(all, baseState({ filterDateRange: { from: new Date('2026-06-01') } }));
    expect(fromOnly.map((e) => e.id)).toEqual(['b', 'c', 'd']);
    const range = filterProjectExpenses(
      all,
      baseState({ filterDateRange: { from: new Date('2026-06-01'), to: new Date('2026-06-05') } }),
    );
    expect(range.map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('combined filters AND together', () => {
    const r = filterProjectExpenses(
      sample,
      baseState({ filterMilestoneId: 'm1', filterExpenseNature: 'regular' }),
    );
    expect(r.map((e) => e.id)).toEqual(['1']);
  });
});

describe('computeProjectExpenseTotals', () => {
  it('aggregates by type and work_type', () => {
    const r = computeProjectExpenseTotals([
      mk({ amount: 100, type: 'expense', work_type: 'material' }),
      mk({ amount: 50, type: 'expense', work_type: 'labor' }),
      mk({ amount: 25, type: 'expense', work_type: 'equipment' }),
      mk({ amount: 500, type: 'income' }),
    ]);
    expect(r).toEqual({
      totalExpenses: 175,
      totalIncome: 500,
      net: 325,
      totalMaterial: 100,
      totalLabor: 50,
    });
  });

  it('handles empty list', () => {
    expect(computeProjectExpenseTotals([])).toEqual({
      totalExpenses: 0,
      totalIncome: 0,
      net: 0,
      totalMaterial: 0,
      totalLabor: 0,
    });
  });
});

describe('hasActiveProjectFilters', () => {
  it('false for empty state', () => {
    expect(hasActiveProjectFilters(baseState())).toBe(false);
  });
  it('true for any non-default field', () => {
    expect(hasActiveProjectFilters(baseState({ searchTerm: 'a' }))).toBe(true);
    expect(hasActiveProjectFilters(baseState({ filterMilestoneId: 'none' }))).toBe(true);
    expect(hasActiveProjectFilters(baseState({ filterDateRange: { from: new Date() } }))).toBe(true);
    expect(hasActiveProjectFilters(baseState({ filterWorkType: 'labor' }))).toBe(true);
  });
});
