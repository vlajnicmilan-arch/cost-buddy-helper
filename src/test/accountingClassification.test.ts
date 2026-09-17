import { describe, expect, it } from 'vitest';
import {
  deriveMaterialExpenseFlag,
  isAccountingCategory,
  isAccountingRelevantInvoice,
  suggestAccountingCategory,
} from '@/lib/eracun/accountingClassification';

const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const PROJECT_BUSINESS = '33333333-3333-4333-8333-333333333333';
const PROJECT_PERSONAL = '44444444-4444-4444-8444-444444444444';
const SOURCE_COMPANY = '55555555-5555-4555-8555-555555555555';
const SOURCE_PERSONAL = '66666666-6666-4666-8666-666666666666';

const projects = [
  { id: PROJECT_BUSINESS, business_profile_id: COMPANY_A },
  { id: PROJECT_PERSONAL, business_profile_id: null },
];

const sources = [
  { id: SOURCE_COMPANY, business_profile_id: COMPANY_A },
  { id: SOURCE_PERSONAL, business_profile_id: null },
];

describe('isAccountingRelevantInvoice', () => {
  it('račun na tvrtku je poslovni', () => {
    expect(isAccountingRelevantInvoice({ business_profile_id: COMPANY_A }, projects)).toBe(true);
  });

  it('osobni račun pripisan poslovnom projektu je poslovni', () => {
    expect(
      isAccountingRelevantInvoice({ business_profile_id: null, project_id: PROJECT_BUSINESS }, projects),
    ).toBe(true);
  });

  it('račun ni na firmi ni na projektu je izvan pripreme', () => {
    expect(isAccountingRelevantInvoice({ business_profile_id: null }, projects)).toBe(false);
  });

  it('račun pripisan osobnom projektu ostaje izvan pripreme', () => {
    expect(
      isAccountingRelevantInvoice({ business_profile_id: null, project_id: PROJECT_PERSONAL }, projects),
    ).toBe(false);
  });

  it('račun pripisan nepoznatom projektu ostaje izvan pripreme', () => {
    expect(
      isAccountingRelevantInvoice({ business_profile_id: null, project_id: 'nepoznat' }, projects),
    ).toBe(false);
  });
});

describe('suggestAccountingCategory', () => {
  it('alat iz stavki', () => {
    expect(
      suggestAccountingCategory({
        supplier_name: 'Pevex',
        total_amount: 120,
        items: [{ name: 'BOSCH bušilica GSB 13' }],
      }),
    ).toBe('tool');
  });

  it('osnovna sredstva iznad praga', () => {
    expect(
      suggestAccountingCategory({
        supplier_name: 'Links',
        total_amount: 1500,
        items: [{ name: 'Laptop HP 15' }],
      }),
    ).toBe('fixed_asset');
  });

  it('stroj ispod praga nije osnovno sredstvo', () => {
    expect(
      suggestAccountingCategory({
        supplier_name: 'Test',
        total_amount: 200,
        items: [{ name: 'mali stroj za graviranje' }],
      }),
    ).toBe('project');
  });

  it('bez signala pada na pripadnost projektu', () => {
    expect(
      suggestAccountingCategory({ supplier_name: 'HEP', total_amount: 80, items: [] }),
    ).toBe('project');
  });

  it('bez ikakvog teksta nema prijedloga', () => {
    expect(suggestAccountingCategory({ items: [] })).toBeNull();
  });
});

describe('deriveMaterialExpenseFlag', () => {
  const base = { sources, projects };

  it('poslovni račun plaćen gotovinom → materijalni trošak', () => {
    expect(
      deriveMaterialExpenseFlag({
        ...base,
        invoice: { business_profile_id: COMPANY_A, paid_at: '2026-09-01T00:00:00Z' },
        paidExpensePaymentSource: 'cash',
      }),
    ).toBe(true);
  });

  it('račun na tvrtku plaćen privatnom karticom → materijalni trošak', () => {
    expect(
      deriveMaterialExpenseFlag({
        ...base,
        invoice: { business_profile_id: COMPANY_A, paid_at: '2026-09-01T00:00:00Z' },
        paidExpensePaymentSource: `custom:${SOURCE_PERSONAL}`,
      }),
    ).toBe(true);
  });

  it('račun na tvrtku plaćen karticom tvrtke → bez oznake', () => {
    expect(
      deriveMaterialExpenseFlag({
        ...base,
        invoice: { business_profile_id: COMPANY_A, paid_at: '2026-09-01T00:00:00Z' },
        paidExpensePaymentSource: `custom:${SOURCE_COMPANY}`,
      }),
    ).toBe(false);
  });

  it('neplaćen račun → bez oznake (izvor nije poznat)', () => {
    expect(
      deriveMaterialExpenseFlag({
        ...base,
        invoice: { business_profile_id: COMPANY_A, paid_at: null },
        paidExpensePaymentSource: 'cash',
      }),
    ).toBe(false);
  });

  it('osobni račun (ni firma ni poslovni projekt) → bez oznake', () => {
    expect(
      deriveMaterialExpenseFlag({
        ...base,
        invoice: { business_profile_id: null, paid_at: '2026-09-01T00:00:00Z' },
        paidExpensePaymentSource: 'cash',
      }),
    ).toBe(false);
  });

  it('osobni račun pripisan poslovnom projektu, plaćen privatnom karticom → materijalni trošak', () => {
    expect(
      deriveMaterialExpenseFlag({
        ...base,
        invoice: { business_profile_id: null, project_id: PROJECT_BUSINESS, paid_at: '2026-09-01T00:00:00Z' },
        paidExpensePaymentSource: `custom:${SOURCE_PERSONAL}`,
      }),
    ).toBe(true);
  });

  it('kartica druge tvrtke nije privatni izvor za ovu tvrtku', () => {
    expect(
      deriveMaterialExpenseFlag({
        sources: [...sources, { id: '77777777-7777-4777-8777-777777777777', business_profile_id: COMPANY_B }],
        projects,
        invoice: { business_profile_id: COMPANY_A, paid_at: '2026-09-01T00:00:00Z' },
        paidExpensePaymentSource: 'custom:77777777-7777-4777-8777-777777777777',
      }),
    ).toBe(true); // nije izvor ove tvrtke → iz perspektive tvrtke A to je tuđi/privatni izvor
  });
});

describe('isAccountingCategory', () => {
  it('prihvaća samo tri dozvoljene vrijednosti', () => {
    expect(isAccountingCategory('project')).toBe(true);
    expect(isAccountingCategory('tool')).toBe(true);
    expect(isAccountingCategory('fixed_asset')).toBe(true);
    expect(isAccountingCategory('material')).toBe(false);
    expect(isAccountingCategory(null)).toBe(false);
    expect(isAccountingCategory(42)).toBe(false);
  });
});

describe('isAccountingHandoverInvoice (F2)', () => {
  const COMPANY = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';
  const PROJECT_BUSINESS = '33333333-3333-4333-8333-333333333333';
  const projects = [
    { id: PROJECT_BUSINESS, business_profile_id: COMPANY },
    { id: '44444444-4444-4444-8444-444444444444', business_profile_id: null },
  ];
  const on = [{ id: COMPANY, accounting_handover_enabled: true }];
  const off = [{ id: COMPANY, accounting_handover_enabled: false }];

  it('tvrtka s uključenim prekidačem → true', () => {
    expect(isAccountingHandoverInvoice({ business_profile_id: COMPANY }, projects, on)).toBe(true);
  });

  it('isključen prekidač → false', () => {
    expect(isAccountingHandoverInvoice({ business_profile_id: COMPANY }, projects, off)).toBe(false);
  });

  it('račun bez tvrtke ali s poslovnim projektom te tvrtke → true', () => {
    expect(
      isAccountingHandoverInvoice({ business_profile_id: null, project_id: PROJECT_BUSINESS }, projects, on),
    ).toBe(true);
  });

  it('osobni račun (bez tvrtke i bez poslovnog projekta) → false', () => {
    expect(isAccountingHandoverInvoice({ business_profile_id: null, project_id: null }, projects, on)).toBe(false);
  });

  it('nepoznata tvrtka u popisu profila → false', () => {
    expect(isAccountingHandoverInvoice({ business_profile_id: OTHER }, projects, on)).toBe(false);
  });
});

describe('resolveInvoiceBusinessProfileId', () => {
  const COMPANY = '11111111-1111-4111-8111-111111111111';
  const PROJECT_BUSINESS = '33333333-3333-4333-8333-333333333333';
  const projects = [{ id: PROJECT_BUSINESS, business_profile_id: COMPANY }];

  it('tvrtka računa ima prednost pred tvrtkom projekta', () => {
    expect(resolveInvoiceBusinessProfileId({ business_profile_id: COMPANY, project_id: null }, projects)).toBe(COMPANY);
  });

  it('bez tvrtke računa uzima tvrtku projekta', () => {
    expect(
      resolveInvoiceBusinessProfileId({ business_profile_id: null, project_id: PROJECT_BUSINESS }, projects),
    ).toBe(COMPANY);
  });

  it('bez oboje → null', () => {
    expect(resolveInvoiceBusinessProfileId({ business_profile_id: null, project_id: null }, projects)).toBe(null);
  });
});
