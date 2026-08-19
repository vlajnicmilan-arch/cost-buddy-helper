/**
 * IZOŠTRENA PONUDA SPAJANJA — čuvari na živim slučajevima.
 *
 * Meta (19.8.2026): dva računa po 15,00 (17.8. i 18.8.), terećenja 8.–10.8.
 * LIDL 1,29 (9.8.): isti iznos, potpuno drugi dobavljač — NIKAD istaknuti
 * prijedlog.
 */
import { describe, it, expect } from 'vitest';
import {
  buildLinkOffer,
  LINK_WINDOW_BEFORE_DAYS,
  LINK_WINDOW_AFTER_DAYS,
  type LinkCandidateInput,
} from '@/lib/eracun/linkCandidates';
import type { MatchTransaction } from '@/lib/eracun/matchPayments';

const tx = (id: string, amount: number, date: string, description: string): MatchTransaction => ({
  id,
  amount,
  date,
  description,
  merchantName: null,
});

const cand = (t: MatchTransaction, amount = t.amount): LinkCandidateInput => ({
  transaction: t,
  amount,
  confidence: 'possible',
});

const invoice = (over: Partial<Parameters<typeof buildLinkOffer>[0]['invoice']> = {}) => ({
  id: 'inv-1',
  supplierName: 'Meta Platforms, Inc.',
  remaining: 15,
  issueDate: '2026-08-18',
  ...over,
});

describe('prozor je sidren na datum izdavanja', () => {
  it('odbacuje terećenja 8.–10.8. za račun od 18.8. (krivo sparivanje)', () => {
    const offer = buildLinkOffer({
      invoice: invoice(),
      candidates: [
        cand(tx('e1', 15, '2026-08-08', 'Facebook - Paypal *facebook')),
        cand(tx('e2', 15, '2026-08-10', 'Facebook - Paypal *facebook')),
      ],
      otherInvoices: [],
    });
    expect(offer.rows).toHaveLength(0);
    expect(offer.highlight).toBeNull();
  });

  it('kartični obrazac: terećenje istog dana ulazi i daje istaknuti prijedlog', () => {
    const offer = buildLinkOffer({
      invoice: invoice(),
      candidates: [cand(tx('card', 15, '2026-08-18', 'Facebook - Paypal *facebook'))],
      otherInvoices: [],
    });
    expect(offer.rows).toHaveLength(1);
    expect(offer.rows[0].dayOffset).toBe(0);
    expect(offer.highlight?.transaction.id).toBe('card');
  });

  it('dan prije izdavanja (knjiženje) još ulazi, tri dana prije ne', () => {
    const offer = buildLinkOffer({
      invoice: invoice(),
      candidates: [
        cand(tx('d1', 15, '2026-08-17', 'Facebook')),
        cand(tx('d3', 15, '2026-08-15', 'Facebook')),
      ],
      otherInvoices: [],
    });
    expect(offer.rows.map((r) => r.transaction.id)).toEqual(['d1']);
  });

  it('odbacuje transakciju izvan prozora s obje strane', () => {
    const offer = buildLinkOffer({
      invoice: invoice(),
      candidates: [
        cand(tx('old', 15, '2026-07-01', 'Facebook')),
        cand(tx('far', 15, '2026-11-01', 'Facebook')),
      ],
      otherInvoices: [],
    });
    expect(offer.rows).toHaveLength(0);
  });

  it('prozor je imenovan −2/+45', () => {
    expect(LINK_WINDOW_BEFORE_DAYS).toBe(2);
    expect(LINK_WINDOW_AFTER_DAYS).toBe(45);
  });
});


describe('naziv diže rang, nikad ne isključuje', () => {
  it('transakcija bez imena (KEKS) ostaje u ponudi', () => {
    const offer = buildLinkOffer({
      invoice: invoice({ supplierName: 'Vodovod Osijek' }),
      candidates: [cand(tx('keks', 15, '2026-08-20', 'Kartično plaćanje'))],
      otherInvoices: [],
    });
    expect(offer.rows.map((r) => r.transaction.id)).toEqual(['keks']);
  });

  it('poklapanje naziva ide na vrh', () => {
    const offer = buildLinkOffer({
      invoice: invoice({ supplierName: 'Vodovod Osijek', remaining: 30 }),
      candidates: [
        cand(tx('a', 30, '2026-08-19', 'LIDL Osijek')),
        cand(tx('b', 30, '2026-08-25', 'Vodovod Osijek d.o.o.')),
      ],
      otherInvoices: [],
    });
    expect(offer.rows[0].transaction.id).toBe('b');
    expect(offer.rows[0].nameMatch).toBe(true);
  });
});

describe('istaknuti prijedlog samo za jednoznačan par', () => {
  it('jedan kandidat točnog iznosa → prijedlog', () => {
    const offer = buildLinkOffer({
      invoice: invoice({ supplierName: 'Vodovod Osijek', remaining: 30 }),
      candidates: [cand(tx('b', 30, '2026-08-25', 'Vodovod Osijek d.o.o.'))],
      otherInvoices: [],
    });
    expect(offer.highlight?.transaction.id).toBe('b');
  });

  it('dva kandidata istog iznosa → obična lista (živi Meta slučaj)', () => {
    const offer = buildLinkOffer({
      invoice: invoice(),
      candidates: [
        cand(tx('e1', 15, '2026-08-08', 'Facebook - Paypal *facebook')),
        cand(tx('e2', 15, '2026-08-09', 'Facebook - Paypal *facebook')),
      ],
      otherInvoices: [],
    });
    expect(offer.rows).toHaveLength(2);
    expect(offer.highlight).toBeNull();
  });

  it('ista transakcija je kandidat i drugom računu → bez prijedloga', () => {
    const offer = buildLinkOffer({
      invoice: invoice(),
      candidates: [cand(tx('e1', 15, '2026-08-08', 'Facebook'))],
      otherInvoices: [
        { id: 'inv-2', supplierName: 'Meta Platforms, Inc.', remaining: 15, issueDate: '2026-08-17' },
      ],
    });
    expect(offer.rows).toHaveLength(1);
    expect(offer.highlight).toBeNull();
  });

  it('LIDL 1,29 — isti iznos, sudar naziva → nikad istaknuto', () => {
    const offer = buildLinkOffer({
      invoice: invoice({ supplierName: 'Vodovod Osijek', remaining: 1.29 }),
      candidates: [cand(tx('lidl', 1.29, '2026-08-19', 'LIDL Hrvatska'))],
      otherInvoices: [],
    });
    expect(offer.rows).toHaveLength(1);
    expect(offer.highlight).toBeNull();
  });
});
