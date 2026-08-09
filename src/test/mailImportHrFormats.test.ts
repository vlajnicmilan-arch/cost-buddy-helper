/**
 * MAIL UVOZ #4 — hrvatski datum i iznos, deterministički broj dokumenta.
 */
import { describe, it, expect } from 'vitest';

import { formatDateHr, parseHrDate, isoToDate, dateToIso } from '@/lib/dateFormat';
import { formatHrAmount, parseHrAmount } from '@/lib/money';
import { findInvoiceNumber } from '../../supabase/functions/_shared/mailImport/invoiceNumber.ts';
import { deterministicExtract } from '../../supabase/functions/_shared/mailImport/deterministicExtract.ts';

describe('parseHrDate — tolerantan unos, ISO izlaz', () => {
  it('prima sve dopuštene oblike', () => {
    expect(parseHrDate('8.8.2026')).toBe('2026-08-08');
    expect(parseHrDate('08.08.2026.')).toBe('2026-08-08');
    expect(parseHrDate(' 15/08/2026 ')).toBe('2026-08-15');
    expect(parseHrDate('2026-08-08')).toBe('2026-08-08');
  });

  it('odbija besmislice umjesto tihog pada', () => {
    expect(parseHrDate('')).toBeNull();
    expect(parseHrDate(null)).toBeNull();
    expect(parseHrDate('32.01.2026')).toBeNull();
    expect(parseHrDate('15.13.2026')).toBeNull();
    expect(parseHrDate('29.02.2027')).toBeNull();
    expect(parseHrDate('sutra')).toBeNull();
  });

  it('prijestupna godina prolazi', () => {
    expect(parseHrDate('29.02.2028')).toBe('2028-02-29');
  });
});

describe('formatDateHr — prikaz', () => {
  it('ISO → dd.mm.gggg.', () => {
    expect(formatDateHr('2026-08-08')).toBe('08.08.2026.');
    expect(formatDateHr('2026-08-08T10:00:00Z')).toBe('08.08.2026.');
  });

  it('prazno i nevaljano daju prazan string', () => {
    expect(formatDateHr(null)).toBe('');
    expect(formatDateHr('nije datum')).toBe('');
  });

  it('kalendar tam-i-natrag ne pomiče dan', () => {
    const d = isoToDate('2026-08-08')!;
    expect(dateToIso(d)).toBe('2026-08-08');
  });
});

describe('parseHrAmount / formatHrAmount', () => {
  it('prima hrvatski i strojni oblik', () => {
    expect(parseHrAmount('1.660,36')).toBeCloseTo(1660.36, 2);
    expect(parseHrAmount('1660,36')).toBeCloseTo(1660.36, 2);
    expect(parseHrAmount('1660.36')).toBeCloseTo(1660.36, 2);
  });

  it('odbija smeće', () => {
    expect(parseHrAmount('')).toBeNull();
    expect(parseHrAmount('abc')).toBeNull();
    expect(parseHrAmount('12,34,56')).toBeNull();
  });

  it('prikaz je hrvatski', () => {
    expect(formatHrAmount(1660.36).replace(/\u00a0/g, ' ')).toBe('1.660,36');
    expect(formatHrAmount(null)).toBe('');
  });
});

describe('Broj dokumenta — samo uz etiketu', () => {
  it('Telemach-stil tijela: etiketa + broj → izvučen', () => {
    const body = 'Poštovani,\nu privitku je račun.\nBroj računa: 1003663185\nHvala.';
    expect(findInvoiceNumber(body).invoiceNumber).toBe('1003663185');
  });

  it('varijante etiketa', () => {
    expect(findInvoiceNumber('Račun br. 2026-001').invoiceNumber).toBe('2026-001');
    expect(findInvoiceNumber('Invoice no. INV/2026/44').invoiceNumber).toBe('INV/2026/44');
  });

  it('bez etikete i bez jasnog kandidata → null', () => {
    expect(findInvoiceNumber('Poštovani, u privitku je dokument. 12.08.2026.').invoiceNumber).toBeNull();
    expect(findInvoiceNumber('').invoiceNumber).toBeNull();
  });

  it('dva različita broja = prazno + višeznačnost', () => {
    const r = findInvoiceNumber('Broj računa: 111222 i broj dokumenta: 333444');
    expect(r.invoiceNumber).toBeNull();
    expect(r.ambiguous).toBe(true);
  });

  it('deterministički ulov nosi broj do ekstrakcije', () => {
    const out = deterministicExtract({ text: 'Broj računa: 1003663185', ownOibs: [] });
    expect(out.invoice_number).toBe('1003663185');
  });
});
