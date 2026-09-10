/**
 * MAIL LIJEVAK — strana valuta i dvosmislen datum.
 *
 * Živi kvar (10.9.2026): račun u GBP padao je na CHECK-u
 * `incoming_invoices_currency_eur` uz generičku poruku, a "10/09/2026" iz
 * poruke primljene 10.9. čitalo se kao 9. listopada.
 */
import { describe, it, expect } from 'vitest';
import {
  foreignInvoiceCurrency,
  foreignExpenseAmount,
  foreignExpenseDescription,
} from '@/lib/mail/foreignCurrency';
import {
  normalizeDateToIso,
  normalizeExtractionDates,
  hasFutureDate,
  FUTURE_DATE_WARNING,
} from '@/lib/mail/dateNormalize';

describe('strana valuta', () => {
  it('EUR i prazno nisu strana valuta', () => {
    expect(foreignInvoiceCurrency({ currency: 'EUR' })).toBeNull();
    expect(foreignInvoiceCurrency({ currency: ' eur ' })).toBeNull();
    expect(foreignInvoiceCurrency({})).toBeNull();
    expect(foreignInvoiceCurrency(null)).toBeNull();
  });

  it('GBP se prepoznaje i normalizira', () => {
    expect(foreignInvoiceCurrency({ currency: 'gbp' })).toBe('GBP');
  });

  it('iznos bez preračuna, opis = dobavljač + broj', () => {
    expect(foreignExpenseAmount({ total_amount: 13.7 })).toBe(13.7);
    expect(foreignExpenseAmount({ total_amount: '13,70' })).toBe(13.7);
    expect(foreignExpenseAmount({ total_amount: null })).toBeNull();
    expect(
      foreignExpenseDescription({ supplier_name: 'Gamers Outlet', invoice_number: 'A-1' }, 'x'),
    ).toBe('Gamers Outlet · A-1');
    expect(foreignExpenseDescription({}, 'Račun')).toBe('Račun');
  });
});

describe('dvosmislen datum prema danu primitka', () => {
  it('"10/09/2026" primljeno 2026-09-10 → 2026-09-10', () => {
    expect(normalizeDateToIso('10/09/2026', { receivedAt: '2026-09-10' })).toBe('2026-09-10');
  });

  it('"09/10/2026" primljeno 2026-09-10 → 2026-09-10 (DD/MM zadano)', () => {
    expect(normalizeDateToIso('09/10/2026', { receivedAt: '2026-09-10' })).toBe('2026-09-10');
  });

  it('"25/12/2025" → 2025-12-25 (američko čitanje ne postoji)', () => {
    expect(normalizeDateToIso('25/12/2025', { receivedAt: '2026-09-10' })).toBe('2025-12-25');
  });

  it('oba čitanja u prošlosti → ostaje europsko', () => {
    expect(normalizeDateToIso('03/04/2025', { receivedAt: '2026-09-10' })).toBe('2025-04-03');
  });

  it('bez konteksta primitka ponašanje ostaje europsko', () => {
    expect(normalizeDateToIso('10/09/2026')).toBe('2026-09-10');
    expect(normalizeDateToIso('28.02.2026.')).toBe('2026-02-28');
  });

  it('ISO je jednoznačan i ostaje kakav jest', () => {
    expect(normalizeDateToIso('2026-10-09', { receivedAt: '2026-09-10' })).toBe('2026-10-09');
    expect(
      normalizeExtractionDates({ issue_date: '2026-10-09' }, { receivedAt: '2026-09-10' })
        .issue_date,
    ).toBe('2026-10-09');
  });
});

describe('upozorenje datum_u_buducnosti', () => {
  it('ISO datum poslije primitka pali upozorenje, ne odbija', () => {
    expect(hasFutureDate({ issue_date: '2026-10-09' }, '2026-09-10')).toBe(true);
    expect(FUTURE_DATE_WARNING).toBe('datum_u_buducnosti');
  });

  it('dan tolerancije ne pali upozorenje', () => {
    expect(hasFutureDate({ issue_date: '2026-09-11' }, '2026-09-10')).toBe(false);
    expect(hasFutureDate({ issue_date: '2026-09-10' }, '2026-09-10')).toBe(false);
  });

  it('prazno i nevaljano ne pale upozorenje', () => {
    expect(hasFutureDate({ issue_date: null }, '2026-09-10')).toBe(false);
    expect(hasFutureDate(null, '2026-09-10')).toBe(false);
  });
});
