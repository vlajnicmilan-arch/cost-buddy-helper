/**
 * Ulazna strana motora — povezivanje POSTOJEĆIH troškova s ulaznim računima.
 * Podaci su iz živog slučaja (osobna polica, računi Vodovoda).
 */
import { describe, it, expect } from 'vitest';
import { matchPayments, type MatchInvoice, type MatchTransaction } from '@/lib/eracun/matchPayments';

const inv = (o: Partial<MatchInvoice> & { id: string }): MatchInvoice => ({
  direction: 'in',
  invoiceNumber: o.id,
  counterpartyName: 'Vodovod i kanalizacija d.o.o.',
  counterpartyOib: null,
  paymentReference: null,
  totalAmount: 0,
  settledAmount: 0,
  issueDate: null,
  paidAt: null,
  ...o,
});

const INVOICES: MatchInvoice[] = [
  inv({ id: 'v-129', totalAmount: 1.29, issueDate: '2025-12-23' }),
  inv({ id: 'v-2941', totalAmount: 29.41, issueDate: '2026-01-23' }),
  inv({ id: 'v-3247', totalAmount: 32.47, issueDate: '2026-02-10' }),
  inv({ id: 'v-123', totalAmount: 1.23, issueDate: '2026-02-28' }),
  inv({ id: 'v-3335', totalAmount: 33.35, issueDate: '2026-03-20' }),
];

const LIDL: MatchTransaction = {
  id: 'e-lidl',
  amount: 1.29,
  date: '2026-01-04',
  description: 'LIDL HRVATSKA D.O.O. K.D. OSIJEK — kupnja karticom',
};

const KEKS_123: MatchTransaction = {
  id: 'e-keks-123',
  amount: 1.23,
  date: '2026-03-10',
  description: 'KEKS PAY plaćanje',
};

const KEKS_3247: MatchTransaction = {
  id: 'e-keks-3247',
  amount: 32.47,
  date: '2026-03-10',
  description: 'KEKS PAY plaćanje',
};

const ALL_TX = [LIDL, KEKS_123, KEKS_3247];

const run = (transactions: MatchTransaction[]) =>
  matchPayments({ invoices: INVOICES, transactions, direction: 'in', allowAmountOnly: true });

describe('ulazni smjer — LIDL ne smije izaći iznad `possible`', () => {
  it('daje kandidata razreda possible s razlogom amount_only', () => {
    const [s] = run([LIDL]);
    expect(s).toBeDefined();
    expect(s.candidates[0].invoiceIds).toEqual(['v-129']);
    expect(s.candidates[0].confidence).toBe('possible');
    expect(s.candidates[0].reason).toBe('amount_only');
    expect(s.autoSelect).toBe(false);
  });

  it('opis troška ostaje netaknut da ga korisnik može odbiti pogledom', () => {
    const [s] = run([LIDL]);
    expect(s.transactionId).toBe('e-lidl');
    expect(LIDL.description).toContain('LIDL');
  });
});

describe('ulazni smjer — KEKS PAY kandidati', () => {
  it('1,23 pogađa račun od 1,23', () => {
    const [s] = run([KEKS_123]);
    expect(s.candidates[0].invoiceIds).toEqual(['v-123']);
    expect(s.candidates[0].confidence).toBe('possible');
    expect(s.candidates[0].allocation['v-123']).toBe(1.23);
  });

  it('32,47 pogađa račun od 32,47', () => {
    const [s] = run([KEKS_3247]);
    expect(s.candidates[0].invoiceIds).toEqual(['v-3247']);
    expect(s.candidates[0].allocation['v-3247']).toBe(32.47);
  });
});

describe('ulazni smjer — motor ne izmišlja', () => {
  it('za 29,41 i 33,35 nema nijednog prijedloga', () => {
    const out = run(ALL_TX);
    const touched = new Set(out.flatMap((s) => s.candidates.flatMap((c) => c.invoiceIds)));
    expect(touched.has('v-2941')).toBe(false);
    expect(touched.has('v-3335')).toBe(false);
  });

  it('bez `allowAmountOnly` ulazna strana ne nudi ništa (samo iznos nije dokaz)', () => {
    const out = matchPayments({ invoices: INVOICES, transactions: ALL_TX, direction: 'in' });
    expect(out).toEqual([]);
  });

  it('trošak izvan prozora od 90 dana ne ulazi u prijedloge', () => {
    const out = run([{ ...LIDL, id: 'far', date: '2025-06-01' }]);
    expect(out).toEqual([]);
  });
});

describe('ulazni smjer — razred se ne diže bez naziva ni reference', () => {
  it('naziv dobavljača u opisu diže na `likely`, ne više', () => {
    const [s] = run([{ ...KEKS_3247, id: 'e-name', description: 'VODOVOD I KANALIZACIJA DOO' }]);
    expect(s.candidates[0].confidence).toBe('likely');
    expect(s.candidates[0].reason).toBe('amount_name');
  });

  it('nijedan kandidat bez naziva/reference nije iznad `possible`', () => {
    const out = run(ALL_TX);
    out.forEach((s) =>
      s.candidates
        .filter((c) => c.reason === 'amount_only')
        .forEach((c) => expect(c.confidence).toBe('possible')),
    );
  });
});
