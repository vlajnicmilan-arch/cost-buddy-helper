import { describe, expect, it } from 'vitest';
import { resolveDirection, storedDirection } from '@/lib/eracun/resolveDirection';
import { fixMojibake } from '@/lib/eracun/mojibake';
import { evaluateInvoice } from '@/lib/eracun/acceptance';
import type { EracunInvoice } from '@/lib/eracun/types';

const AKROBAT = '39916265994';

const invoice = (over: Partial<EracunInvoice> = {}): EracunInvoice => ({
  invoiceNumber: '337-1-1',
  docType: '387',
  docTypeRaw: '387',
  issueDate: '2026-02-06',
  dueDate: '2026-03-06',
  currency: 'EUR',
  supplier: { name: 'Akrobat', oib: 'HR39916265994', taxIdRaw: 'HR39916265994' },
  customer: { name: 'Kupac d.o.o.', oib: 'HR11111111111', taxIdRaw: 'HR11111111111' },
  iban: 'HR7324020061101086163',
  paymentReference: 'HR00 337-1-1',
  lines: [],
  taxSubtotals: [],
  taxExclusiveAmount: 100,
  taxAmount: 25,
  taxInclusiveAmount: 125,
  payableAmount: 125,
  suggestedAmount: 125,
  hrFiskPresent: false,
  warnings: [],
  ...over,
});

describe('eRačun — smjer po OIB-u', () => {
  it('prepoznaje izlazni račun unatoč HR prefiksu u XML-u', () => {
    expect(resolveDirection({
      supplierOib: 'HR39916265994', customerOib: 'HR11111111111', companyOib: AKROBAT,
    })).toBe('out');
  });

  it('prepoznaje ulazni račun kad je tvrtka kupac', () => {
    expect(resolveDirection({
      supplierOib: '11111111111', customerOib: ' hr 39916265994 ', companyOib: AKROBAT,
    })).toBe('in');
  });

  it('označava račun koji ne pripada tvrtki', () => {
    expect(resolveDirection({
      supplierOib: 'HR11111111111', customerOib: 'HR22222222222', companyOib: AKROBAT,
    })).toBe('foreign');
  });

  it('bez OIB-a tvrtke smjer je nepoznat', () => {
    expect(resolveDirection({
      supplierOib: 'HR11111111111', customerOib: 'HR22222222222', companyOib: null,
    })).toBe('unknown');
  });

  it('foreign i unknown se spremaju kao ulazni', () => {
    expect(storedDirection('foreign')).toBe('in');
    expect(storedDirection('unknown')).toBe('in');
    expect(storedDirection('out')).toBe('out');
  });
});

describe('eRačun — dvostruko kodiran tekst', () => {
  it('popravlja hrvatske dijakritike', () => {
    expect(fixMojibake("graÄ'evinski")).toBe('građevinski');
    expect(fixMojibake('GaliÄ‡')).toBe('Galić');
  });

  it('ne dira ispravan tekst', () => {
    expect(fixMojibake('Građevinski obrt Galić')).toBe('Građevinski obrt Galić');
    expect(fixMojibake('HR00 337-1-1')).toBe('HR00 337-1-1');
    expect(fixMojibake(null)).toBeNull();
  });
});

describe('eRačun — tip 387 i dospijeće prije izdavanja', () => {
  it('tip 387 (najam) prolazi kao normalan račun', () => {
    const res = evaluateInvoice(invoice());
    expect(res.accepted).toBe(true);
    expect(res.needsDecision).toBe(false);
    expect(res.amount).toBe(125);
  });

  it('upozorava kad je dospijeće prije izdavanja', () => {
    const res = evaluateInvoice(invoice({ dueDate: '2026-01-30' }));
    expect(res.accepted).toBe(true);
    expect(res.cautions.map((c) => c.code)).toContain('due_before_issue');
  });

  it('bez upozorenja kad je dospijeće ispravno', () => {
    const res = evaluateInvoice(invoice());
    expect(res.cautions.map((c) => c.code)).not.toContain('due_before_issue');
  });
});
