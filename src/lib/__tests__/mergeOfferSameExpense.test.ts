/** Nalog 4 — ponuda spajanja kod ručnog unosa na pravilu „isti trošak". */
import { describe, it, expect } from 'vitest';
import { findMergeOffers, type MergeOfferRow } from '../mergeOfferCandidate';
import { getInitialBankMatchStatus } from '../bankMatchStatus';

const OWNER = 'aa000000-0000-4000-8000-000000000001';
const OTHER = 'bb000000-0000-4000-8000-000000000002';
const WALLET_ID = 'cc000000-0000-4000-8000-000000000003';
const WALLET = `custom:${WALLET_ID}`;
const WALLET_2 = 'custom:dd000000-0000-4000-8000-000000000004';

const bank = (id: string, amount: number, date: string, over: Partial<MergeOfferRow> = {}): MergeOfferRow => ({
  id, user_id: OWNER, type: 'expense', amount, date, payment_source: WALLET, currency: null,
  expense_nature: 'regular', bank_transaction_id: `bt-${id}`, bank_match_status: 'bank_only',
  is_advance: false, linked_advance_ids: null, deleted_at: null, ...over,
});

const OLUK_BANK = bank('b-oluk', 472.4, '2026-08-09', {
  merchant_name: 'Oluk',
  description: 'Oluk, Branjin Vrh [Card *1542]',
  payment_source_card_id: 'card-1542',
  card_last4: '1542',
  bank_raw_line: '09.08.2026 OLUK, BRANJIN VRH [CARD *1542] -472,40',
  bank_raw_line_source: 'pdf',
  bank_account_id: null,
  import_batch_id: 'batch-1',
  created_at: '2026-08-10T06:00:00Z',
});

const olukTx = { userId: OWNER, type: 'expense', amount: 472.4, date: '2026-08-11', payment_source: WALLET, merchant_name: 'Oluk Interijeri' };

describe('findMergeOffers', () => {
  it('Oluk: jedan kandidat sa svim poljima za prikaz', () => {
    const offers = findMergeOffers(olukTx, [OLUK_BANK]);
    expect(offers).toHaveLength(1);
    const o = offers[0];
    expect(o.row.id).toBe('b-oluk');
    expect(o.row.date).toBe('2026-08-09');
    expect(o.row.amount).toBe(472.4);
    expect(o.row.payment_source).toBe(WALLET);
    expect(o.row.card_last4).toBe('1542');
    expect(o.row.merchant_name).toBe('Oluk');
    expect(o.row.bank_raw_line).toContain('OLUK, BRANJIN VRH');
    expect(o.origin).toBe('statement');
    expect(o.arrivedAt).toBe('2026-08-10T06:00:00Z');
    expect(o.merchantSimilar).toBe(true);
    expect(o.dayDiff).toBe(2);
  });

  it('sinkronizirani redak ima izvor „sync"', () => {
    const offers = findMergeOffers(olukTx, [{ ...OLUK_BANK, bank_account_id: 'acc-1' }]);
    expect(offers[0].origin).toBe('sync');
  });

  it('dva Petrol retka istog iznosa unutar 4 dana → oba, sličniji/bliži prvi', () => {
    const tx = { userId: OWNER, type: 'expense', amount: 60, date: '2026-08-03', payment_source: WALLET, merchant_name: 'Petrol' };
    const far = bank('b-far', 60, '2026-08-06', { merchant_name: 'PETROL PM ZADAR JADRANSKA' });
    const near = bank('b-near', 60, '2026-08-04', { merchant_name: 'PETROL PM ZADAR JADRANSKA' });
    const other = bank('b-other', 60, '2026-08-03', { merchant_name: 'Konzum' });
    const offers = findMergeOffers(tx, [far, other, near]);
    expect(offers.map(o => o.row.id)).toEqual(['b-near', 'b-far', 'b-other']);
    expect(offers.map(o => o.merchantSimilar)).toEqual([true, true, false]);
  });

  it('nisu u ponudi: potvrđen, tuđi, drugi novčanik, druga upisana valuta, >4 dana', () => {
    const rows = [
      { ...OLUK_BANK, id: 'confirmed', bank_match_status: 'confirmed' },
      { ...OLUK_BANK, id: 'other-owner', user_id: OTHER },
      { ...OLUK_BANK, id: 'other-wallet', payment_source: WALLET_2 },
      { ...OLUK_BANK, id: 'usd', currency: 'USD' },
      { ...OLUK_BANK, id: 'far', date: '2026-08-06' },
    ];
    expect(findMergeOffers({ ...olukTx, currency: 'EUR' }, rows)).toEqual([]);
  });

  it('prazna valuta = EUR: prolazi uz upisani EUR na drugoj strani', () => {
    expect(findMergeOffers({ ...olukTx, currency: 'EUR' }, [OLUK_BANK])).toHaveLength(1);
    expect(findMergeOffers(olukTx, [{ ...OLUK_BANK, currency: 'EUR' }])).toHaveLength(1);
  });
});

describe('„Spremi kao novi" uz ponudu', () => {
  const linked = new Set([WALLET_ID]);
  it('bez ponude: novčanik vezan na banku → pending_bank (kao prije)', () => {
    expect(getInitialBankMatchStatus({ source: 'manual', paymentSource: WALLET, bankLinkedSourceIds: linked })).toBe('pending_bank');
  });
  it('uz ponudu (banka je već donijela trošak) → manual, ne pending_bank', () => {
    expect(getInitialBankMatchStatus({ source: 'manual', paymentSource: WALLET, bankLinkedSourceIds: linked, bankAlreadyPresent: true })).toBe('manual');
    expect(getInitialBankMatchStatus({ source: 'ocr', paymentSource: WALLET, bankLinkedSourceIds: linked, bankAlreadyPresent: true })).toBe('manual');
  });
});
