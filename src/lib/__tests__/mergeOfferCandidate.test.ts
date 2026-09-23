import { describe, it, expect } from 'vitest';
import { findMergeOffers, type MergeOfferNewTx, type MergeOfferRow } from '../mergeOfferCandidate';

/** Nalog 4: stari API (jedan ili null) zamijenjen popisom; ovaj omotač drži stara očekivanja. */
const findMergeOfferCandidate = (tx: Omit<MergeOfferNewTx, 'userId'>, rows: MergeOfferRow[]) => {
  const offers = findMergeOffers({ ...tx, userId: 'u1' }, rows);
  return offers.length === 1 ? offers[0].row : null;
};

const SRC = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'custom:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** Live case: Pevex receipt 21,50 on 17.08. vs bank row 21,50 on 18.08. */
const pevexScan = {
  type: 'expense',
  amount: 21.5,
  date: new Date('2026-08-17T10:00:00.000Z'),
  payment_source: SRC,
  currency: null,
};

const bankRow: MergeOfferRow = {
  id: 'bank-1',
  user_id: 'u1',
  type: 'expense',
  amount: 21.5,
  date: '2026-08-18T00:00:00.000Z',
  payment_source: SRC,
  currency: null,
  expense_nature: 'regular',
  bank_transaction_id: 'imp2:abc',
  bank_match_status: 'bank_only',
  is_advance: false,
  linked_advance_ids: null,
  deleted_at: null,
};

describe('findMergeOfferCandidate', () => {
  it('offers the merge for the live Pevex case (21,50 / 17.08. vs 18.08.)', () => {
    expect(findMergeOfferCandidate(pevexScan, [bankRow])?.id).toBe('bank-1');
  });

  it('stays silent when the payment source differs', () => {
    expect(findMergeOfferCandidate(pevexScan, [{ ...bankRow, payment_source: OTHER }])).toBeNull();
  });

  it('stays silent at 5 days apart, offers at exactly 4', () => {
    expect(
      findMergeOfferCandidate(pevexScan, [{ ...bankRow, date: '2026-08-22T00:00:00.000Z' }]),
    ).toBeNull();
    expect(
      findMergeOfferCandidate(pevexScan, [{ ...bankRow, date: '2026-08-21T00:00:00.000Z' }])?.id,
    ).toBe('bank-1');
  });

  it('NAMJERNA PROMJENA (nalog 4): dva kandidata → ponuda s oba (prije: šutnja)', () => {
    const res = findMergeOffers({ ...pevexScan, userId: 'u1' }, [bankRow, { ...bankRow, id: 'bank-2' }]);
    expect(res.map(o => o.row.id)).toEqual(['bank-1', 'bank-2']);
  });

  it('stays silent for transfers', () => {
    expect(
      findMergeOfferCandidate({ ...pevexScan, type: 'transfer' }, [{ ...bankRow, type: 'transfer' }]),
    ).toBeNull();
  });

  it('stays silent for balance corrections on either side', () => {
    expect(findMergeOfferCandidate({ ...pevexScan, expense_nature: 'correction' }, [bankRow])).toBeNull();
    expect(
      findMergeOfferCandidate(pevexScan, [{ ...bankRow, expense_nature: 'correction' }]),
    ).toBeNull();
  });

  it('stays silent when the amount differs by a cent', () => {
    expect(findMergeOfferCandidate(pevexScan, [{ ...bankRow, amount: 21.51 }])).toBeNull();
  });

  it('stays silent when the candidate is manual (no fingerprint)', () => {
    expect(
      findMergeOfferCandidate(pevexScan, [{ ...bankRow, bank_transaction_id: null }]),
    ).toBeNull();
  });

  it('stays silent when the candidate is already confirmed, deleted or advance-linked', () => {
    expect(findMergeOfferCandidate(pevexScan, [{ ...bankRow, bank_match_status: 'confirmed' }])).toBeNull();
    expect(findMergeOfferCandidate(pevexScan, [{ ...bankRow, deleted_at: '2026-08-19' }])).toBeNull();
    expect(findMergeOfferCandidate(pevexScan, [{ ...bankRow, is_advance: true }])).toBeNull();
  });

  it('stays silent on an explicit currency mismatch but ignores unset currency', () => {
    expect(
      findMergeOfferCandidate({ ...pevexScan, currency: 'EUR' }, [{ ...bankRow, currency: 'USD' }]),
    ).toBeNull();
    expect(
      findMergeOfferCandidate({ ...pevexScan, currency: 'EUR' }, [{ ...bankRow, currency: null }])?.id,
    ).toBe('bank-1');
  });

  it('stays silent for a different transaction type', () => {
    expect(findMergeOfferCandidate(pevexScan, [{ ...bankRow, type: 'income' }])).toBeNull();
  });
});
