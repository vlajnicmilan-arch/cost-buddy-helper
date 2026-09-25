import { describe, it, expect } from 'vitest';
import {
  allocateToLimits,
  buildGroupedCategoryTotals,
  matchesCategoryFilter,
  parseBudgetLimitScope,
  toGroupLimitKey,
  customIdsInGroup,
} from '@/lib/categoryGroupMatch';
import { computeBudgetCategoryStats, MANUAL_ASSIGNED_CATEGORY } from '@/lib/budgetCategoryStats';
import { buildGroupedTableRows, exportCategoryColumns, generateCSVReport } from '@/lib/reportExport';
import { EXEMPT_CATEGORY_ID } from '@/lib/categoryAssign';
import type { BudgetCategory } from '@/types/budget';
import type { Expense } from '@/types/expense';
import { vi } from 'vitest';

const exportTextFile = vi.fn();
vi.mock('@/lib/fileExport', () => ({
  exportTextFile: (...a: unknown[]) => exportTextFile(...a),
  exportPDFDoc: vi.fn(),
}));

const BUDGET = '9a4ab943-718e-4af9-a37c-c42205b5d573';
let n = 0;
const tx = (category: string, amount: number, extra: Partial<Expense> = {}): Expense => ({
  id: `e${++n}`,
  user_id: 'u',
  type: 'expense',
  amount,
  category,
  description: 'x',
  date: new Date('2026-09-10'),
  status: 'approved',
  budget_id: BUDGET,
  payment_source: 'cash',
  expense_nature: 'regular',
  ...extra,
} as Expense);

// Oblik redaka iz budget_categories (stari ključevi u bazi).
const cat = (category: string, limit: number): BudgetCategory => ({
  id: `c-${category}`, budget_id: BUDGET, category, limit_amount: limit, icon: null, color: null,
});

describe('budžet: skupina i list', () => {
  it('stari „food" limit broji Hranu i Kafiće (coffee, restaurants), osim kad postoji uži limit', () => {
    const rows = computeBudgetCategoryStats({ id: BUDGET, project_id: null }, [cat('food', 300)], [
      tx('coffee', 10), tx('restaurants', 40), tx('food', 5), tx('groceries', 20),
    ]);
    expect(parseBudgetLimitScope('food')).toEqual({ kind: 'groups', groups: ['food', 'cafes'] });
    expect(rows.find((r) => r.category === 'food')!.spent).toBe(75);
    const { perLimit } = allocateToLimits([tx('coffee', 10), tx('restaurants', 40)], ['food', 'coffee']);
    expect(perLimit[0].map((e) => e.category)).toEqual(['restaurants']);
    expect(perLimit[1].map((e) => e.category)).toEqual(['coffee']);
  });

  it('novi limit group:food pokriva samo svoju skupinu', () => {
    const { perLimit, unassigned } = allocateToLimits([tx('coffee', 10), tx('groceries', 5)], ['group:food']);
    expect(perLimit[0].map((e) => e.category)).toEqual(['groceries']);
    expect(unassigned.map((e) => e.category)).toEqual(['coffee']);
  });

  it('limit skupine cafes broji coffee i restaurants; stari ključ se ne prepisuje', () => {
    const limits = [cat(toGroupLimitKey('cafes'), 400)];
    const rows = computeBudgetCategoryStats({ id: BUDGET, project_id: null }, limits, [tx('coffee', 10), tx('restaurants', 40)]);
    expect(rows[0].category).toBe('group:cafes');
    expect(rows[0].spent).toBe(50);
  });

  it('najuži limit pobjeđuje, nema dvostrukog brojanja', () => {
    const limits = ['group:cafes', 'coffee'];
    const { perLimit, unassigned } = allocateToLimits([tx('coffee', 10), tx('restaurants', 40)], limits);
    expect(perLimit[0].map((e) => e.category)).toEqual(['restaurants']);
    expect(perLimit[1].map((e) => e.category)).toEqual(['coffee']);
    expect(unassigned).toHaveLength(0);
    const total = perLimit.flat().reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(50);
  });

  it('stari list „rent" i novi list „rent" su isti limit; „utilities" ne ulazi u rent', () => {
    const { perLimit, unassigned } = allocateToLimits([tx('rent', 450), tx('utilities', 80)], ['rent']);
    expect(perLimit[0]).toHaveLength(1);
    expect(unassigned).toHaveLength(1);
  });

  it('movement_kind i korekcija ne ulaze', () => {
    const { perLimit, unassigned } = allocateToLimits([
      tx('coffee', 10, { movement_kind: 'loan_given' } as Partial<Expense>),
      tx('coffee', 20, { expense_nature: 'correction' } as unknown as Partial<Expense>),
      tx('coffee', 3),
    ], ['coffee']);
    expect(perLimit[0].map((e) => e.amount)).toEqual([3]);
    expect(unassigned).toHaveLength(0);
  });

  it('Kredit (d4d31ee6): izuzeta kategorija se broji — 3.047,59 €', () => {
    const rows = computeBudgetCategoryStats({ id: BUDGET, project_id: null }, [], [
      tx(EXEMPT_CATEGORY_ID, 1419.98), tx(EXEMPT_CATEGORY_ID, 1627.61),
    ]);
    const total = rows.reduce((s, r) => s + r.spent, 0);
    expect(Math.round(total * 100) / 100).toBe(3047.59);
  });

  it('vlastita kategorija broji se po group_key', () => {
    const customs = [{ id: 'c1', name: 'Pekara', group_key: 'cafes' }];
    const { perLimit } = allocateToLimits([tx('c1', 7)], ['group:cafes'], customs);
    expect(perLimit[0]).toHaveLength(1);
  });

  it('projektni budžet zadržava staro pravilo', () => {
    const rows = computeBudgetCategoryStats({ id: BUDGET, project_id: 'p1' }, [cat('transport', 100)], [tx('car', 20)]);
    expect(rows[0].spent).toBe(20);
  });
});

describe('filtar skupine', () => {
  it('hvata stari i novi ključ te skupine i vlastite s group_key', () => {
    const customs = [{ id: 'c1', name: 'Servis kod Ive', group_key: 'car' }];
    const ids = customIdsInGroup('car', customs);
    expect(matchesCategoryFilter('transport', 'group:car', ids)).toBe(true);
    expect(matchesCategoryFilter('car', 'group:car', ids)).toBe(true);
    expect(matchesCategoryFilter('fuel', 'group:car', ids)).toBe(true);
    expect(matchesCategoryFilter('c1', 'group:car', ids)).toBe(true);
    expect(matchesCategoryFilter('coffee', 'group:car', ids)).toBe(false);
    expect(matchesCategoryFilter(EXEMPT_CATEGORY_ID, EXEMPT_CATEGORY_ID)).toBe(true);
    expect(matchesCategoryFilter('coffee', EXEMPT_CATEGORY_ID)).toBe(false);
  });
  it('običan ključ i dalje traži točno podudaranje', () => {
    expect(matchesCategoryFilter('food', 'food')).toBe(true);
    expect(matchesCategoryFilter('groceries', 'food')).toBe(false);
  });
});

describe('PDF i izvoz', () => {
  it('jedan redak zbroja po skupini, listovi ispod; stari i novi ključ spojeni', () => {
    const rows = buildGroupedCategoryTotals({ food: 5, groceries: 20, coffee: 10, [EXEMPT_CATEGORY_ID]: 999 });
    const groups = rows.map((r) => r.group);
    expect(groups.filter((g) => g === 'food')).toHaveLength(1);
    expect(rows.find((r) => r.group === 'food')!.amount).toBe(25);
    const own = rows.find((r) => r.group === null)!;
    expect(own.amount).toBe(999);
    expect(own.leaves[0].customId).toBe(EXEMPT_CATEGORY_ID);
    expect(rows.reduce((t, r) => t + r.amount, 0)).toBe(1034);
    const table = buildGroupedTableRows(rows, [], (x) => String(x));
    expect(table.filter((r) => r[0] !== '')).toHaveLength(3);
  });

  it('stupac skupine uz kategoriju', () => {
    const c = exportCategoryColumns('coffee');
    expect(c.group).not.toBe('');
    expect(c.category).not.toBe('coffee');
  });

  it('CSV ima stupac „Skupina"', async () => {
    await generateCSVReport({
      expenses: [tx('coffee', 3)],
      dateRange: { start: new Date('2026-09-01'), end: new Date('2026-09-30') },
      totals: { income: 0, expenses: 3, balance: -3, transfers: 0 },
      byCategory: { coffee: 3 },
      byPaymentSource: {},
    });
    const csv = String(exportTextFile.mock.calls[0][0]);
    const [header, row] = csv.split('\n');
    expect(header.split(',')).toEqual(['Datum', 'Tip', 'Opis', 'Skupina', 'Kategorija', 'Način plaćanja', 'Iznos']);
    expect(row.split(',')).toHaveLength(7);
  });
});
