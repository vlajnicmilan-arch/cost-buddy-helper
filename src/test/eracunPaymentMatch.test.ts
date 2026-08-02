/**
 * Spajanje uplata iz izvoda s računima — stvarni slučajevi iz produkcije.
 */
import { describe, it, expect } from 'vitest';
import { namesMatch, nameTokens } from '@/lib/eracun/normalizeName';
import {
  matchPayments,
  extractIbans,
  paymentFetchWindow,
  remainingOf,
  type MatchInvoice,
  type MatchTransaction,
} from '@/lib/eracun/matchPayments';

const inv = (o: Partial<MatchInvoice> & { id: string }): MatchInvoice => ({
  direction: 'out',
  invoiceNumber: o.id,
  counterpartyName: null,
  counterpartyOib: null,
  paymentReference: null,
  totalAmount: 100,
  settledAmount: 0,
  issueDate: '2026-02-11',
  paidAt: null,
  ...o,
});

const BAMI_INVOICE = inv({
  id: 'bami-3',
  invoiceNumber: '3/P1/1',
  counterpartyName: 'BAMI INTERIJER građevinski obrt, vl. Ivica Galić',
  counterpartyOib: 'HR12345678901',
  paymentReference: 'HR00 345-3-1',
  totalAmount: 2300,
  issueDate: '2026-02-11',
});

const BAMI_TX: MatchTransaction = {
  id: 'tx-bami',
  amount: 2300,
  date: '2026-01-28',
  description:
    'BAMI INTERIJER GRAĐEVINSKI OBRT OSIJEK HR0223400091140170591, 1 - Poračunu HR99 HR99 2026-8640140-10820370778',
};

describe('normalizeName — token subset', () => {
  it('prepoznaje BAMI unatoč različitom zapisu naziva', () => {
    expect(namesMatch(BAMI_INVOICE.counterpartyName, BAMI_TX.description)).toBe(true);
  });

  it('odbacuje podudaranje na jednom tokenu', () => {
    expect(namesMatch('BAMI', 'BAMI INTERIJER OSIJEK')).toBe(false);
  });

  it('odbacuje podudaranje samo na pravnom obliku i gradu', () => {
    expect(namesMatch('Nešto d.o.o. Osijek', 'Drugo d.o.o. Osijek')).toBe(false);
  });

  it('izbacuje šum iz tokena', () => {
    expect(nameTokens('BAMI INTERIJER građevinski obrt, vl. Ivica Galić').sort())
      .toEqual(['bami', 'galic', 'interijer', 'ivica']);
  });
});

describe('extractIbans', () => {
  it('vadi platiteljev IBAN iz opisa', () => {
    expect(extractIbans(BAMI_TX.description)).toContain('HR0223400091140170591');
  });
});

describe('matchPayments — BAMI slučaj', () => {
  it('spaja iako je uplata ranija od računa i naziv se ne poklapa doslovno', () => {
    const [s] = matchPayments({ invoices: [BAMI_INVOICE], transactions: [BAMI_TX] });
    expect(s).toBeDefined();
    expect(s.candidates[0].invoiceIds).toEqual(['bami-3']);
    expect(s.candidates[0].reason).toBe('amount_name');
    expect(s.candidates[0].confidence).toBe('likely');
    expect(s.autoSelect).toBe(false);
  });

  it('poziv na broj s računa u opisu daje siguran, predoznačen prijedlog', () => {
    const tx = { ...BAMI_TX, description: 'Uplata po racunu HR00 345-3-1 BAMI' };
    const [s] = matchPayments({ invoices: [BAMI_INVOICE], transactions: [tx] });
    expect(s.candidates[0].reason).toBe('payment_reference');
    expect(s.candidates[0].confidence).toBe('certain');
    expect(s.autoSelect).toBe(true);
  });

  it('naučeni IBAN daje jak signal bez naziva u opisu', () => {
    const tx = { ...BAMI_TX, description: 'Uplata HR0223400091140170591 ref 12345' };
    const [s] = matchPayments({
      invoices: [BAMI_INVOICE],
      transactions: [tx],
      learnedIbans: [{ iban: 'HR0223400091140170591', counterpartyOib: '12345678901', counterpartyName: null }],
    });
    expect(s.candidates[0].reason).toBe('learned_iban');
    expect(s.candidates[0].confidence).toBe('strong');
    expect(s.autoSelect).toBe(false);
  });
});

describe('matchPayments — šest identičnih iznosa iste druge strane', () => {
  const plantOn = ['1/P1/1', '4/P1/1', '6/P1/1', '10/P1/1', '13/P1/1', '16/P1/1'].map((num, i) =>
    inv({
      id: num,
      invoiceNumber: num,
      counterpartyName: 'PlantOn Fork d.o.o.',
      totalAmount: 312.5,
      issueDate: `2026-0${i + 1}-05`,
    }),
  );
  const tx: MatchTransaction = {
    id: 'tx-planton',
    amount: 312.5,
    date: '2026-04-01',
    description: 'PLANTON FORK DOO uplata',
  };

  it('preporuča najstariji nenaplaćeni, ostale zadržava kao izbor', () => {
    const [s] = matchPayments({ invoices: plantOn, transactions: [tx] });
    expect(s.ambiguous).toBe(true);
    expect(s.candidates[0].invoiceIds).toEqual(['1/P1/1']);
    expect(s.candidates[0].oldestFallback).toBe(true);
    expect(s.candidates.length).toBeGreaterThan(1);
    expect(s.autoSelect).toBe(false);
  });

  it('nudi skupno podudaranje kad uplata pokriva dva računa', () => {
    const [s] = matchPayments({
      invoices: plantOn,
      transactions: [{ ...tx, id: 'tx-2', amount: 625 }],
    });
    const group = s.candidates.find((c) => c.group);
    expect(group).toBeDefined();
    expect(group!.invoiceIds).toEqual(['1/P1/1', '4/P1/1']);
  });
});

describe('matchPayments — djelomična uplata', () => {
  it('raspoređuje manji iznos na najstariji račun i označava ga djelomičnim', () => {
    const invoice = inv({
      id: 'partial',
      counterpartyName: 'Tactura Grupa j.d.o.o.',
      totalAmount: 1000,
      settledAmount: 200,
    });
    const [s] = matchPayments({
      invoices: [invoice],
      transactions: [{ id: 'tx-p', amount: 300, date: '2026-02-15', description: 'TACTURA GRUPA JDOO djelomicno' }],
    });
    expect(remainingOf(invoice)).toBe(800);
    expect(s.candidates[0].allocation.partial).toBe(300);
    expect(s.candidates[0].partial).toBe(true);
  });
});

describe('matchPayments — nespojeno ostaje nespojeno', () => {
  it('bez poziva na broj, naziva i IBAN-a nema prijedloga', () => {
    const [s] = matchPayments({
      invoices: [BAMI_INVOICE],
      transactions: [{ id: 'x', amount: 2300, date: '2026-02-12', description: 'Nepoznata uplata' }],
    });
    expect(s).toBeUndefined();
  });

  it('izvan prozora od 90 dana nema prijedloga', () => {
    const [s] = matchPayments({
      invoices: [BAMI_INVOICE],
      transactions: [{ ...BAMI_TX, id: 'far', date: '2025-06-01' }],
    });
    expect(s).toBeUndefined();
  });
});

describe('paymentFetchWindow — prozor je sidren na račune, ne na današnji dan', () => {
  /**
   * Regresija: dohvat je koristio `now() − 120 dana`, pa je svaki račun stariji
   * od ~4 mjeseca ostao bez ijedne uplate u bazenu. Nenaplaćeni računi su po
   * prirodi stari — testni podaci su bili svježi i kvar nije bio vidljiv.
   */
  const OLD_INVOICE = inv({
    ...BAMI_INVOICE,
    id: 'old-1',
    issueDate: '2024-11-05',
  });
  const OLD_TX: MatchTransaction = { ...BAMI_TX, id: 'old-tx', date: '2024-10-22' };

  it('dohvat pokriva uplatu uz račun star više od godinu dana', () => {
    const w = paymentFetchWindow([OLD_INVOICE], 'out');
    expect(w).not.toBeNull();
    expect(w!.since).toBe('2024-08-07');
    expect(w!.until).toBe('2025-02-03');
    expect(OLD_TX.date >= w!.since!).toBe(true);
    expect(OLD_TX.date <= w!.until!).toBe(true);
  });

  it('motor daje `likely` prijedlog za taj isti par', () => {
    const [s] = matchPayments({ invoices: [OLD_INVOICE], transactions: [OLD_TX] });
    expect(s.candidates[0].confidence).toBe('likely');
    expect(s.candidates[0].allocation['old-1']).toBe(2300);
  });

  it('bez nenaplaćenih računa nema dohvata', () => {
    expect(paymentFetchWindow([], 'out')).toBeNull();
    expect(paymentFetchWindow([{ ...OLD_INVOICE, paidAt: '2025-01-01' }], 'out')).toBeNull();
    expect(paymentFetchWindow([{ ...OLD_INVOICE, direction: 'in' }], 'out')).toBeNull();
  });

  it('račun bez datuma izdavanja skida granice (motor tada prima sve)', () => {
    const w = paymentFetchWindow([{ ...OLD_INVOICE, issueDate: null }], 'out');
    expect(w).toEqual({ since: null, until: null });
  });
});
