import { describe, it, expect } from 'vitest';
import {
  isFinaOriginInvoice,
  invoicePeriod,
  selectHandoverInvoices,
  vatRecap,
  groupHandoverInvoices,
  packageTotals,
  type HandoverInvoiceLike,
} from '@/lib/eracun/handoverPackage';

const PROFILE = 'bp-1';
const profiles = [{ id: PROFILE, accounting_handover_enabled: true }];
const projects = [
  { id: 'p-1', business_profile_id: PROFILE, name: 'Projekt 1' },
  { id: 'p-off', business_profile_id: null },
];

const inv = (over: Partial<HandoverInvoiceLike> = {}): HandoverInvoiceLike => ({
  id: Math.random().toString(36).slice(2),
  supplier_name: 'Dobavljač',
  total_amount: 125,
  vat_amount: 25,
  issue_date: '2026-09-10',
  business_profile_id: PROFILE,
  ...over,
});

const select = (invoices: HandoverInvoiceLike[], period = '2026-09') =>
  selectHandoverInvoices({ invoices, projects, profiles, businessProfileId: PROFILE, period });

describe('isFinaOriginInvoice', () => {
  it('prepoznaje eRačun seriju po import_batch_id', () => {
    expect(isFinaOriginInvoice(inv({ import_batch_id: 'b-1' }))).toBe(true);
  });
  it('prepoznaje XML datoteku', () => {
    expect(isFinaOriginInvoice(inv({ source_filename: 'racun-123.XML' }))).toBe(true);
  });
  it('mail/sken račun nije FINA podrijetla', () => {
    expect(isFinaOriginInvoice(inv())).toBe(false);
  });
});

describe('invoicePeriod', () => {
  it('vraća YYYY-MM iz datuma računa', () => {
    expect(invoicePeriod(inv({ issue_date: '2026-09-10' }))).toBe('2026-09');
  });
  it('bez datuma vraća null', () => {
    expect(invoicePeriod(inv({ issue_date: null }))).toBeNull();
  });
});

describe('selectHandoverInvoices', () => {
  it('uzima račun tvrtke u razdoblju', () => {
    expect(select([inv()]).included).toHaveLength(1);
  });

  it('isključuje FINA podrijetlo', () => {
    expect(select([inv({ import_batch_id: 'b-1' })]).included).toHaveLength(0);
  });

  it('razdoblje ide po datumu računa, ne po plaćanju', () => {
    const out = select([inv({ issue_date: '2026-08-31', paid_at: '2026-09-05' })]);
    expect(out.included).toHaveLength(0);
  });

  it('račun bez datuma ide u „bez datuma — provjeri"', () => {
    const out = select([inv({ issue_date: null })]);
    expect(out.included).toHaveLength(0);
    expect(out.missingDate).toHaveLength(1);
  });

  it('isključuje tvrtku s isključenim prekidačem', () => {
    const out = selectHandoverInvoices({
      invoices: [inv()],
      projects,
      profiles: [{ id: PROFILE, accounting_handover_enabled: false }],
      businessProfileId: PROFILE,
      period: '2026-09',
    });
    expect(out.included).toHaveLength(0);
  });

  it('uzima račun bez tvrtke koji je pripisan poslovnom projektu', () => {
    const out = select([inv({ business_profile_id: null, project_id: 'p-1' })]);
    expect(out.included).toHaveLength(1);
  });

  it('ne uzima čisto osobni račun', () => {
    const out = select([inv({ business_profile_id: null, project_id: null })]);
    expect(out.included).toHaveLength(0);
    expect(out.missingDate).toHaveLength(0);
  });
});

describe('vatRecap', () => {
  it('grupira po stopi iz stavki', () => {
    const rows = vatRecap([
      inv({ items: [{ lineAmount: 100, vatPercent: 25 }, { lineAmount: 50, vatPercent: 0 }] }),
      inv({ items: [{ lineAmount: 200, vatPercent: 25 }] }),
    ]);
    expect(rows.map((r) => r.rate)).toEqual([0, 25]);
    expect(rows.find((r) => r.rate === 25)).toMatchObject({ base: 300, vat: 75, total: 375 });
  });

  it('bez stavki koristi total/vat kao „nerazvrstano"', () => {
    const rows = vatRecap([inv({ items: null, total_amount: 125, vat_amount: 25 })]);
    expect(rows).toEqual([{ rate: null, base: 100, vat: 25, total: 125 }]);
  });
});

describe('groupHandoverInvoices', () => {
  it('dijeli po kategoriji i po projektu unutar „pripadnost projektu"', () => {
    const groups = groupHandoverInvoices([
      inv({ accounting_category: 'project', project_id: 'p-1' }),
      inv({ accounting_category: 'project', project_id: 'p-2' }),
      inv({ accounting_category: 'tool' }),
      inv({ accounting_category: null }),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups.filter((g) => g.kind === 'project').map((g) => g.projectId).sort())
      .toEqual(['p-1', 'p-2']);
    expect(groups.find((g) => g.kind === 'unset')?.invoices).toHaveLength(1);
  });

  it('zbraja iznose skupine', () => {
    const groups = groupHandoverInvoices([
      inv({ accounting_category: 'tool', total_amount: 125, vat_amount: 25 }),
      inv({ accounting_category: 'tool', total_amount: 75, vat_amount: 15 }),
    ]);
    expect(groups[0]).toMatchObject({ total: 200, vat: 40 });
  });
});

describe('packageTotals', () => {
  it('računa osnovicu, PDV i ukupno', () => {
    expect(packageTotals([
      inv({ total_amount: 125, vat_amount: 25 }),
      inv({ total_amount: 100, vat_amount: 0 }),
    ])).toEqual({ count: 2, base: 200, vat: 25, total: 225 });
  });
});
