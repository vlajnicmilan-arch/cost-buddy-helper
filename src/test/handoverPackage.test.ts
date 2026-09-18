import { describe, it, expect } from 'vitest';
import {
  isHandoverExpense,
  isBusinessExpenseForProfile,
  expensePeriod,
  selectHandoverExpenses,
  resolveExpenseAccountingCategory,
  deriveMaterialExpenseFlag,
  vatRecap,
  groupHandoverExpenses,
  packageTotals,
  type HandoverExpenseLike,
} from '@/lib/accounting/handoverPackage';
import { zipEntryName } from '@/lib/accounting/handoverZipExport';

const PROFILE = 'bp-1';
const projects = [
  { id: 'p-1', business_profile_id: PROFILE, name: 'Projekt 1' },
  { id: 'p-other', business_profile_id: 'bp-2', name: 'Tuđi projekt' },
  { id: 'p-personal', business_profile_id: null },
];

const exp = (over: Partial<HandoverExpenseLike> = {}): HandoverExpenseLike => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  merchant_name: 'Trgovac',
  date: '2026-09-10',
  amount: 125,
  vat_amount: 25,
  vat_rate: 25,
  receipt_url: 'user-1/racun-1.jpg',
  business_profile_id: PROFILE,
  ...over,
});

const select = (expenses: HandoverExpenseLike[], period = '2026-09') =>
  selectHandoverExpenses({ expenses, projects, businessProfileId: PROFILE, period });

describe('isHandoverExpense', () => {
  it('uzima poslovni trošak sa slikom', () => {
    expect(isHandoverExpense(exp(), projects, PROFILE)).toBe(true);
  });

  it('odbija trošak bez slike', () => {
    expect(isHandoverExpense(exp({ receipt_url: null }), projects, PROFILE)).toBe(false);
  });

  it('odbija obrisan trošak', () => {
    expect(isHandoverExpense(exp({ deleted_at: '2026-09-01' }), projects, PROFILE)).toBe(false);
  });

  it('odbija trošak vezan na eRačun (invoice_id)', () => {
    expect(isHandoverExpense(exp({ invoice_id: 'inv-1' }), projects, PROFILE)).toBe(false);
  });

  it('odbija prihod', () => {
    expect(isHandoverExpense(exp({ type: 'income' }), projects, PROFILE)).toBe(false);
  });
});

describe('isBusinessExpenseForProfile', () => {
  it('trošak na projektu odabrane tvrtke je poslovni', () => {
    expect(isBusinessExpenseForProfile(
      exp({ business_profile_id: null, project_id: 'p-1' }), projects, PROFILE,
    )).toBe(true);
  });

  it('owner_funding_choice (material/owner_loan) znači „vlasnik platio za firmu"', () => {
    expect(isBusinessExpenseForProfile(
      exp({ business_profile_id: null, project_id: null, owner_funding_choice: 'material' }),
      projects, PROFILE,
    )).toBe(true);
    expect(isBusinessExpenseForProfile(
      exp({ business_profile_id: null, project_id: null, owner_funding_choice: 'owner_loan' }),
      projects, PROFILE,
    )).toBe(true);
  });

  it('čisto osobni trošak nije poslovni', () => {
    expect(isBusinessExpenseForProfile(
      exp({ business_profile_id: null, project_id: null, owner_funding_choice: null }),
      projects, PROFILE,
    )).toBe(false);
  });

  it('trošak tuđe tvrtke/projekta nije u ovom paketu', () => {
    expect(isBusinessExpenseForProfile(
      exp({ business_profile_id: 'bp-2' }), projects, PROFILE,
    )).toBe(false);
  });
});

describe('selectHandoverExpenses', () => {
  it('uzima trošak u razdoblju po datumu troška', () => {
    expect(select([exp()]).included).toHaveLength(1);
  });

  it('razdoblje ide po datumu, ne po plaćanju', () => {
    const out = select([exp({ date: '2026-08-31' })]);
    expect(out.included).toHaveLength(0);
  });

  it('trošak bez datuma ide u „bez datuma — provjeri"', () => {
    const out = select([exp({ date: null })]);
    expect(out.included).toHaveLength(0);
    expect(out.missingDate).toHaveLength(1);
  });

  it('osobni trošak ne ulazi ni u popis za provjeru', () => {
    const out = select([exp({ business_profile_id: null, project_id: null, owner_funding_choice: null })]);
    expect(out.included).toHaveLength(0);
    expect(out.missingDate).toHaveLength(0);
  });
});

describe('expensePeriod', () => {
  it('vraća YYYY-MM iz datuma', () => {
    expect(expensePeriod(exp({ date: '2026-09-10' }))).toBe('2026-09');
  });
  it('bez datuma vraća null', () => {
    expect(expensePeriod(exp({ date: null }))).toBeNull();
  });
});

describe('resolveExpenseAccountingCategory', () => {
  it('spremljena kategorija ima prednost', () => {
    expect(resolveExpenseAccountingCategory(exp({ accounting_category: 'tool', project_id: 'p-1' }))).toBe('tool');
  });
  it('trošak s projektom izvodi „pripadnost projektu"', () => {
    expect(resolveExpenseAccountingCategory(exp({ project_id: 'p-1' }))).toBe('project');
  });
  it('bez projekta i spremljene kategorije je „bez kategorije"', () => {
    expect(resolveExpenseAccountingCategory(exp({ business_profile_id: PROFILE }))).toBe('unset');
  });
});

describe('deriveMaterialExpenseFlag', () => {
  const sources = [
    { id: 's-personal', business_profile_id: null },
    { id: 's-business', business_profile_id: PROFILE },
  ];

  it('owner_funding_choice=material → materijalni trošak', () => {
    expect(deriveMaterialExpenseFlag({
      expense: exp({ owner_funding_choice: 'material', payment_source: 'custom:s-business' }),
      sources, businessProfileId: PROFILE,
    })).toBe(true);
  });

  it('owner_funding_choice=owner_loan → nije materijalni trošak (pozajmica)', () => {
    expect(deriveMaterialExpenseFlag({
      expense: exp({ owner_funding_choice: 'owner_loan', payment_source: 'cash' }),
      sources, businessProfileId: PROFILE,
    })).toBe(false);
  });

  it('prazan izbor + gotovina uz poslovni trošak → materijalni trošak', () => {
    expect(deriveMaterialExpenseFlag({
      expense: exp({ owner_funding_choice: null, payment_source: 'cash' }),
      sources, businessProfileId: PROFILE,
    })).toBe(true);
  });

  it('prazan izbor + kartica tvrtke → nije materijalni trošak', () => {
    expect(deriveMaterialExpenseFlag({
      expense: exp({ owner_funding_choice: null, payment_source: 'custom:s-business' }),
      sources, businessProfileId: PROFILE,
    })).toBe(false);
  });

  it('prazan izbor + privatna kartica uz poslovni trošak → materijalni trošak', () => {
    expect(deriveMaterialExpenseFlag({
      expense: exp({ owner_funding_choice: null, payment_source: 'custom:s-personal' }),
      sources, businessProfileId: PROFILE,
    })).toBe(true);
  });
});

describe('vatRecap', () => {
  it('grupira po stopi iz vat_rate', () => {
    const rows = vatRecap([
      exp({ amount: 125, vat_amount: 25, vat_rate: 25 }),
      exp({ amount: 100, vat_amount: 0, vat_rate: 0 }),
    ]);
    expect(rows.map((r) => r.rate)).toEqual([0, 25]);
    expect(rows.find((r) => r.rate === 25)).toMatchObject({ base: 100, vat: 25, total: 125 });
  });

  it('bez PDV podataka ide u „nerazvrstano"', () => {
    const rows = vatRecap([exp({ vat_rate: null, vat_amount: null, amount: 40 })]);
    expect(rows).toEqual([{ rate: null, base: 40, vat: 0, total: 40 }]);
  });
});

describe('groupHandoverExpenses', () => {
  it('dijeli po kategoriji i po projektu unutar „pripadnost projektu"', () => {
    const groups = groupHandoverExpenses([
      exp({ project_id: 'p-1' }),
      exp({ project_id: 'p-other' }),
      exp({ accounting_category: 'tool', business_profile_id: PROFILE }),
      exp({ accounting_category: null, business_profile_id: PROFILE }),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups.filter((g) => g.kind === 'project').map((g) => g.projectId).sort())
      .toEqual(['p-1', 'p-other']);
    expect(groups.find((g) => g.kind === 'unset')?.expenses).toHaveLength(1);
  });

  it('zbraja iznose skupine', () => {
    const groups = groupHandoverExpenses([
      exp({ accounting_category: 'tool', amount: 125, vat_amount: 25 }),
      exp({ accounting_category: 'tool', amount: 75, vat_amount: 15 }),
    ]);
    expect(groups[0]).toMatchObject({ total: 200, vat: 40 });
  });
});

describe('packageTotals', () => {
  it('računa osnovicu, PDV i ukupno', () => {
    expect(packageTotals([
      exp({ amount: 125, vat_amount: 25 }),
      exp({ amount: 100, vat_amount: 0 }),
    ])).toEqual({ count: 2, base: 200, vat: 25, total: 225 });
  });
});

describe('zipEntryName', () => {
  it('naziv nosi redni broj, trgovca i iznos, s poštanim znakovima', () => {
    const name = zipEntryName(3, exp({ merchant_name: 'Pevec d.o.o.', amount: 125.5 }));
    expect(name).toBe('03-Pevec-d-o-o-125,50.pdf');
  });

  it('bez trgovca koristi generički naziv', () => {
    expect(zipEntryName(1, exp({ merchant_name: null, amount: 10 }))).toBe('01-racun-10,00.pdf');
  });
});
