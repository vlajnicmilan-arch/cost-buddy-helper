import { describe, expect, it } from 'vitest';
import { fingerprintInput, invoiceFingerprint, normalizeOib } from '@/lib/eracun/fingerprint';
import { evaluateInvoice } from '@/lib/eracun/acceptance';
import type { EracunInvoice } from '@/lib/eracun/types';

const baseInvoice = (over: Partial<EracunInvoice> = {}): EracunInvoice => ({
  invoiceNumber: 'LZ-2026-000456',
  docType: '380',
  docTypeRaw: '380',
  issueDate: '2026-07-01',
  dueDate: '2026-07-15',
  currency: 'EUR',
  supplier: { name: 'Primjer d.o.o.', oib: '12345678901', taxIdRaw: 'HR12345678901' },
  customer: { name: 'Kupac d.o.o.', oib: '98765432109', taxIdRaw: 'HR98765432109' },
  iban: 'HR1723600001101234565',
  paymentReference: null,
  lines: [],
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

describe('eRačun — otisak protiv duplikata', () => {
  it('normalizira OIB (HR prefiks, razmaci)', () => {
    expect(normalizeOib(' hr123 456 78901 ')).toBe('12345678901');
  });

  it('isti ulaz daje isti otisak bez obzira na format', () => {
    expect(fingerprintInput('HR12345678901', ' lz-2026-000456 ')).toBe(
      fingerprintInput('12345678901', 'LZ-2026-000456'),
    );
  });

  it('sha256 je 64 heksadecimalna znaka i stabilan', async () => {
    const a = await invoiceFingerprint('HR12345678901', 'LZ-2026-000456');
    const b = await invoiceFingerprint('12345678901', 'lz-2026-000456');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  it('različit broj računa daje različit otisak', async () => {
    const a = await invoiceFingerprint('12345678901', 'A-1');
    const b = await invoiceFingerprint('12345678901', 'A-2');
    expect(a).not.toBe(b);
  });
});

describe('eRačun — pravila prihvaćanja (v1)', () => {
  it('380 i 394 prolaze s pozitivnim iznosom', () => {
    expect(evaluateInvoice(baseInvoice())).toMatchObject({ accepted: true, amount: 150 });
    expect(evaluateInvoice(baseInvoice({ docType: '394', docTypeRaw: '394' }))).toMatchObject({
      accepted: true,
      amount: 150,
    });
  });

  it('381 prolazi kao odobrenje s negativnim iznosom', () => {
    const res = evaluateInvoice(baseInvoice({ docType: '381', docTypeRaw: '381', suggestedAmount: -150 }));
    expect(res).toMatchObject({ accepted: true, amount: -150, isCreditNote: true });
  });

  it('ostali tipovi se odbijaju s razlogom', () => {
    const res = evaluateInvoice(baseInvoice({ docType: 'other', docTypeRaw: '325' }));
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('unsupported_doc_type');
    expect(res.params).toEqual({ docType: '325' });
  });

  it('valuta osim EUR se odbija', () => {
    const res = evaluateInvoice(baseInvoice({ currency: 'USD' }));
    expect(res).toMatchObject({ accepted: false, reason: 'unsupported_currency' });
  });

  it('nedostatak iznosa, OIB-a ili broja računa odbija dokument', () => {
    expect(evaluateInvoice(baseInvoice({ suggestedAmount: null, payableAmount: null })).reason).toBe('missing_total');
    expect(
      evaluateInvoice(baseInvoice({ supplier: { name: 'X', oib: null, taxIdRaw: null } })).reason,
    ).toBe('missing_supplier');
    expect(evaluateInvoice(baseInvoice({ invoiceNumber: null })).reason).toBe('missing_invoice_number');
  });
});
