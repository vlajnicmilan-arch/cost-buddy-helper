import { describe, expect, it } from 'vitest';
import {
  GROWTH_MIN_DELTA,
  GROWTH_MIN_RATIO,
  growthByGroup,
  monthSummary,
  overBudgetItems,
  recurringMerchants,
  type ObradaRow,
} from '../monthlyReview';

const REF = new Date(2026, 8, 15); // rujan 2026

const row = (over: Partial<ObradaRow>): ObradaRow => ({
  amount: 10,
  type: 'expense',
  date: new Date(2026, 8, 5),
  category: 'groceries',
  ...over,
});

describe('monthSummary', () => {
  it('zbraja samo stvarni prihod i potrošnju u mjesecu', () => {
    const rows = [
      row({ type: 'income', amount: 1000, category: 'salary' }),
      row({ amount: 200 }),
      row({ amount: 50, expense_nature: 'correction' }), // nije stvarna potrošnja
      row({ type: 'transfer', amount: 300 }), // prijenos se ne broji
      row({ amount: 999, deleted_at: '2026-09-10' }), // obrisan
      row({ amount: 70, project_id: 'p1' }), // projektni, ne osobni
      row({ amount: 40, date: new Date(2026, 7, 20) }), // prošli mjesec
    ];
    const s = monthSummary(rows, REF);
    expect(s.income).toBe(1000);
    expect(s.spend).toBe(200);
    expect(s.net).toBe(800);
  });

  it('prazno stanje', () => {
    expect(monthSummary([], REF)).toEqual({ income: 0, spend: 0, net: 0 });
  });
});

describe('growthByGroup', () => {
  const foodSpend = (month: number, amount: number, category = 'groceries'): ObradaRow =>
    row({ date: new Date(2026, month, 10), amount, category });

  it('skupina raste kad prijeđe oba praga', () => {
    const rows = [
      foodSpend(5, 100), foodSpend(6, 100), foodSpend(7, 100), // prosjek 100
      foodSpend(8, 100 + 100 * (GROWTH_MIN_RATIO - 1) + GROWTH_MIN_DELTA + 1), // 146
    ];
    const g = growthByGroup(rows, REF);
    expect(g).toHaveLength(1);
    expect(g[0].key).toBe('food');
    expect(g[0].categories.map((c) => c.key)).toContain('groceries');
  });

  it('ispod praga iznosa se ne javlja', () => {
    const rows = [foodSpend(5, 10), foodSpend(6, 10), foodSpend(7, 10), foodSpend(8, 10 + GROWTH_MIN_DELTA - 1)];
    expect(growthByGroup(rows, REF)).toHaveLength(0);
  });

  it('ispod praga omjera se ne javlja', () => {
    const rows = [foodSpend(5, 1000), foodSpend(6, 1000), foodSpend(7, 1000), foodSpend(8, 1000 * GROWTH_MIN_RATIO - 1)];
    expect(growthByGroup(rows, REF)).toHaveLength(0);
  });

  it('prosjek 0 (nove skupine) se ne javlja', () => {
    expect(growthByGroup([foodSpend(8, 500)], REF)).toHaveLength(0);
  });

  it('izuzeta kategorija (korekcija) se ne broji', () => {
    const rows = [
      foodSpend(5, 100), foodSpend(6, 100), foodSpend(7, 100),
      foodSpend(8, 200, 'groceries'),
      row({ date: new Date(2026, 8, 10), amount: 500, category: 'groceries', expense_nature: 'correction' }),
    ];
    const g = growthByGroup(rows, REF);
    expect(g).toHaveLength(1);
    expect(g[0].current).toBe(200);
  });
});

describe('recurringMerchants', () => {
  const coffee = (month: number, amount = 5): ObradaRow =>
    row({ date: new Date(2026, month, 12), amount, merchant_name: 'Caffe Bar Central', category: 'cafes' });

  it('trgovac u 3 od 4 mjeseca ulazi, s godišnjom projekcijom', () => {
    const rows = [coffee(5), coffee(6), coffee(8)];
    const r = recurringMerchants(rows, REF);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Caffe Bar Central');
    expect(r[0].monthsPresent).toBe(3);
    expect(r[0].monthTotal).toBe(5);
    expect(r[0].yearlyProjection).toBeCloseTo((15 / 4) * 12, 2);
  });

  it('trgovac u 2 mjeseca ne ulazi', () => {
    expect(recurringMerchants([coffee(5), coffee(8)], REF)).toHaveLength(0);
  });

  it('poznata pretplata se označi, ne duplicira', () => {
    const rows = [coffee(5), coffee(6), coffee(7), coffee(8)];
    const rules = [
      { merchant_name: 'Caffe Bar Central', type: 'expense', is_active: true, business_profile_id: null },
    ];
    const r = recurringMerchants(rows, REF, rules);
    expect(r).toHaveLength(1);
    expect(r[0].isKnownSubscription).toBe(true);
  });

  it('poslovna pretplata ne označava osobnog trgovca', () => {
    const rows = [coffee(5), coffee(6), coffee(8)];
    const rules = [
      { merchant_name: 'Caffe Bar Central', type: 'expense', is_active: true, business_profile_id: 'bp1' },
    ];
    expect(recurringMerchants(rows, REF, rules)[0].isKnownSubscription).toBe(false);
  });

  it('varijacije imena se spajaju u jednog trgovca', () => {
    const rows = [
      row({ date: new Date(2026, 5, 1), merchant_name: 'KONZUM 123 ZAGREB' }),
      row({ date: new Date(2026, 6, 1), merchant_name: 'Konzum' }),
      row({ date: new Date(2026, 8, 1), merchant_name: 'KONZUM, Zagreb' }),
    ];
    expect(recurringMerchants(rows, REF)).toHaveLength(1);
  });

  it('prazno stanje', () => {
    expect(recurringMerchants([], REF)).toEqual([]);
  });
});

describe('overBudgetItems', () => {
  it('samo osobni budžeti i samo probijeni limiti', () => {
    const budgets = [
      {
        id: 'b1', name: 'Mjesečni', project_id: null,
        categories: [
          { category: 'groceries', limit_amount: 100, spent: 130, isOverBudget: true },
          { category: 'cafes', limit_amount: 50, spent: 40, isOverBudget: false },
        ],
      },
      {
        id: 'b2', name: 'Projekt', project_id: 'p1',
        categories: [{ category: 'material', limit_amount: 10, spent: 99, isOverBudget: true }],
      },
    ];
    const items = overBudgetItems(budgets);
    expect(items).toHaveLength(1);
    expect(items[0].categoryKey).toBe('groceries');
    expect(items[0].overBy).toBe(30);
  });
});

describe('growthByGroup — vlastite kategorije', () => {
  const UUID_G = '6e5f84cb-0000-4000-8000-000000000001';
  const UUID_N = 'a5129537-0000-4000-8000-000000000002';
  const customs = [
    { id: UUID_G, name: 'Ljekarna', group_key: 'personal' },
    { id: UUID_N, name: 'Konji', group_key: null },
  ];
  const spend = (month: number, amount: number, category: string): ObradaRow =>
    row({ amount, category, date: new Date(2026, month, 5) });

  it('s group_key ide u skupinu i prikazuje ime, bez group_key je zaseban redak', () => {
    const rows = [5, 6, 7].flatMap((m) => [spend(m, 20, UUID_G), spend(m, 30, UUID_N)]);
    rows.push(spend(8, 100, UUID_G), spend(8, 120, UUID_N));
    const g = growthByGroup(rows, REF, customs);
    const personal = g.find((x) => x.key === 'personal');
    expect(personal?.filter).toBe('group:personal');
    expect(personal?.labelKey).toBe('categoryTree.groups.personal');
    expect(personal?.categories[0]).toMatchObject({ key: UUID_G, customName: 'Ljekarna', labelKey: null });
    const own = g.find((x) => x.key === UUID_N);
    expect(own).toMatchObject({ filter: UUID_N, customName: 'Konji', labelKey: null, categories: [] });
    for (const item of [...g, ...g.flatMap((x) => x.categories)]) {
      expect(item.customName ?? item.labelKey).not.toMatch(/^[0-9a-f]{8}-/);
    }
  });

  it('prosjek dijeli s 3 puna mjeseca i kad povijest pokriva samo zadnji mjesec', () => {
    // Samo kolovoz u povijesti (kraći dohvat): prosjek = 90 / 3 = 30, ne 90.
    const rows = [spend(7, 90, 'groceries'), spend(8, 100, 'groceries')];
    const g = growthByGroup(rows, REF);
    expect(g[0]).toMatchObject({ key: 'food', average: 30, current: 100 });
  });
});

describe('overBudgetItems — vlastita kategorija', () => {
  it('prikazuje ime, nikad UUID', () => {
    const items = overBudgetItems(
      [{ id: 'b', name: 'B', categories: [{ category: 'u-1', limit_amount: 10, spent: 20, isOverBudget: true }] }],
      [{ id: 'u-1', name: 'Konji' }],
    );
    expect(items[0]).toMatchObject({ customName: 'Konji', labelKey: null });
  });
});
