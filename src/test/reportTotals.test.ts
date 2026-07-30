import { describe, it, expect } from 'vitest';
import {
  computeReportTotals,
  buildCategoryTotalsById,
  aggregateCategoryTotalsByName,
  formatPercent,
  isCorrectionTx,
} from '@/lib/reportTotals';

const tx = (over: Partial<any> = {}) => ({
  type: 'expense',
  amount: 100,
  category: 'other',
  expense_nature: null,
  income_source_id: null,
  ...over,
});

describe('reportTotals', () => {
  it('korekcija (type income) se ne broji u prihode', () => {
    const t = computeReportTotals([
      tx({ type: 'income', amount: 763.32, expense_nature: 'correction' }),
      tx({ type: 'income', amount: 320.38 }),
    ]);
    expect(t.income).toBe(320.38);
  });

  it('korekcija (type expense) se ne broji u troškove', () => {
    const t = computeReportTotals([
      tx({ amount: 84.93, expense_nature: 'correction' }),
      tx({ amount: 15.07 }),
    ]);
    expect(t.expenses).toBe(15.07);
  });

  it('ulazni transfer ide u transfers, ne u income', () => {
    const t = computeReportTotals([
      tx({ type: 'transfer', amount: 100, income_source_id: 'src-1' }),
    ]);
    expect(t.income).toBe(0);
    expect(t.transfers).toBe(100);
  });

  it('regularni prihod/trošak normalno + neto', () => {
    const t = computeReportTotals([
      tx({ type: 'income', amount: 500 }),
      tx({ type: 'expense', amount: 200 }),
    ]);
    expect(t).toMatchObject({ income: 500, expenses: 200, balance: 300, transfers: 0 });
  });

  it('byCategory izostavlja korekcije i ne-troškove', () => {
    const by = buildCategoryTotalsById([
      tx({ amount: 50, category: 'food' }),
      tx({ amount: 84.93, category: 'food', expense_nature: 'correction' }),
      tx({ type: 'income', amount: 10, category: 'food' }),
    ]);
    expect(by).toEqual({ food: 50 });
  });

  it('kategorije agregirane po imenu (2 ID-a → 1 redak)', () => {
    const rows = aggregateCategoryTotalsByName(
      { a: 10, b: 5, c: 30 },
      (id) => (id === 'c' ? 'Hrana' : 'Ostalo'),
    );
    expect(rows).toEqual([
      { name: 'Hrana', amount: 30 },
      { name: 'Ostalo', amount: 15 },
    ]);
  });

  it('postotak u hrvatskom formatu sa zarezom', () => {
    expect(formatPercent(82.1, 100, 'hr-HR')).toBe('82,1%');
    expect(formatPercent(1, 0, 'hr-HR')).toBe('0,0%');
  });

  it('isCorrectionTx detektira korekciju', () => {
    expect(isCorrectionTx({ expense_nature: 'correction' })).toBe(true);
    expect(isCorrectionTx({ expense_nature: 'regular' })).toBe(false);
  });
});
