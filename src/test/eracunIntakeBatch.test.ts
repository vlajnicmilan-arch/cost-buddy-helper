import { describe, expect, it } from 'vitest';
import { buildIntakeRows, summarizeIntake, toInsertRow, type EracunParsedFile } from '@/lib/eracun/intakeBatch';
import { sortIncomingInvoices, daysUntilDue } from '@/lib/eracun/sortInvoices';
import type { EracunInvoice } from '@/lib/eracun/types';

const invoice = (over: Partial<EracunInvoice> = {}): EracunInvoice => ({
  invoiceNumber: 'A-1',
  docType: '380',
  docTypeRaw: '380',
  issueDate: '2026-07-01',
  dueDate: '2026-07-15',
  currency: 'EUR',
  supplier: { name: 'Dobavljač d.o.o.', oib: '12345678901', taxIdRaw: 'HR12345678901' },
  customer: { name: 'Kupac', oib: '98765432109', taxIdRaw: 'HR98765432109' },
  iban: 'HR1723600001101234565',
  paymentReference: null,
  lines: [{ lineId: '1', name: 'Usluga', quantity: 1, unitPrice: 120, lineAmount: 120, vatPercent: 25 }],
  taxSubtotals: [],
  taxExclusiveAmount: 120,
  taxAmount: 30,
  taxInclusiveAmount: 150,
  payableAmount: 150,
  suggestedAmount: 150,
  hrFiskPresent: true,
  warnings: [],
  ...over,
});

const file = (fingerprint: string, over: Partial<EracunParsedFile> = {}): EracunParsedFile => ({
  fileName: `${fingerprint}.xml`,
  invoice: invoice(),
  acceptance: { accepted: true, amount: 150, isCreditNote: false, cautions: [], needsDecision: false },
  fingerprint,
  ...over,
});

describe('eRačun — priprema serije', () => {
  it('označava duplikat prema već spremljenim otiscima', () => {
    const rows = buildIntakeRows([file('aa')], new Set(['aa']));
    expect(rows[0].duplicateOf).toBe('existing');
    expect(rows[0].importable).toBe(false);
  });

  it('označava duplikat unutar iste serije (drugo pojavljivanje)', () => {
    const rows = buildIntakeRows([file('aa'), file('aa')], new Set());
    expect(rows[0].duplicateOf).toBeNull();
    expect(rows[1].duplicateOf).toBe('batch');
    expect(summarizeIntake(rows)).toEqual({ total: 2, importable: 1, duplicates: 1, rejected: 0 });
  });

  it('odbijeni dokument nije uvoziv i ne troši otisak', () => {
    const rejected = file('bb', {
      acceptance: { accepted: false, reason: 'unsupported_currency', params: { currency: 'USD' }, isCreditNote: false, cautions: [], needsDecision: false },
    });
    const rows = buildIntakeRows([rejected, file('bb')], new Set());
    expect(rows[0].importable).toBe(false);
    expect(rows[1].duplicateOf).toBeNull();
    expect(rows[1].importable).toBe(true);
  });

  it('mapira redak u zapis za spremanje bez diranja expenses polja', () => {
    const [row] = buildIntakeRows([file('cc')], new Set());
    const payload = toInsertRow(row, { userId: 'u1', businessProfileId: 'b1', batchId: 'batch-1' });
    expect(payload).toMatchObject({
      user_id: 'u1',
      business_profile_id: 'b1',
      supplier_oib: '12345678901',
      invoice_number: 'A-1',
      total_amount: 150,
      vat_amount: 30,
      currency: 'EUR',
      doc_type: '380',
      fingerprint: 'cc',
      import_batch_id: 'batch-1',
      source_filename: 'cc.xml',
    });
    expect(payload.items).toHaveLength(1);
  });

  it('odobrenje (381) sprema negativan iznos iz pravila prihvaćanja', () => {
    const credit = file('dd', {
      invoice: invoice({ docType: '381', docTypeRaw: '381', suggestedAmount: -150 }),
      acceptance: { accepted: true, amount: -150, isCreditNote: true, cautions: [], needsDecision: false },
    });
    const [row] = buildIntakeRows([credit], new Set());
    expect(toInsertRow(row, { userId: 'u1', businessProfileId: null, batchId: 'b' }).total_amount).toBe(-150);
  });
});

describe('eRačun — poredak popisa', () => {
  const mk = (invoice_number: string, due_date: string | null, paid_at: string | null, issue_date = '2026-07-01') =>
    ({ invoice_number, due_date, paid_at, issue_date });

  it('neplaćeni idu prije plaćenih', () => {
    const sorted = sortIncomingInvoices([
      mk('paid', '2026-07-01', '2026-07-02T10:00:00Z'),
      mk('open', '2026-12-31', null),
    ]);
    expect(sorted.map((i) => i.invoice_number)).toEqual(['open', 'paid']);
  });

  it('neplaćeni su poredani po dospijeću uzlazno', () => {
    const sorted = sortIncomingInvoices([
      mk('c', '2026-08-10', null),
      mk('a', '2026-07-05', null),
      mk('b', '2026-07-20', null),
    ]);
    expect(sorted.map((i) => i.invoice_number)).toEqual(['a', 'b', 'c']);
  });

  it('neplaćeni bez dospijeća idu na kraj neplaćenih, ali prije plaćenih', () => {
    const sorted = sortIncomingInvoices([
      mk('nodue', null, null),
      mk('paid', '2026-01-01', '2026-01-02T00:00:00Z'),
      mk('due', '2026-09-01', null),
    ]);
    expect(sorted.map((i) => i.invoice_number)).toEqual(['due', 'nodue', 'paid']);
  });

  it('plaćeni su poredani od najnovije plaćenog', () => {
    const sorted = sortIncomingInvoices([
      mk('old', '2026-01-01', '2026-01-05T00:00:00Z'),
      mk('new', '2026-01-01', '2026-03-05T00:00:00Z'),
    ]);
    expect(sorted.map((i) => i.invoice_number)).toEqual(['new', 'old']);
  });

  it('poredak je stabilan za isto dospijeće (izdavanje pa broj računa)', () => {
    const sorted = sortIncomingInvoices([
      mk('b', '2026-07-01', null, '2026-06-01'),
      mk('a', '2026-07-01', null, '2026-06-01'),
    ]);
    expect(sorted.map((i) => i.invoice_number)).toEqual(['a', 'b']);
  });

  it('računa dane do dospijeća, negativno za zakašnjele', () => {
    const today = new Date(2026, 6, 10);
    expect(daysUntilDue('2026-07-15', today)).toBe(5);
    expect(daysUntilDue('2026-07-05', today)).toBe(-5);
    expect(daysUntilDue(null, today)).toBeNull();
  });
});
