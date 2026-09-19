/**
 * Uparivanje dviju strana prijenosa — stvarni redci iz kolovoza 2026.
 */
import { describe, it, expect } from 'vitest';
import { matchTransferPair, type TransferPairCandidate } from '../transferPairMatch';

const REVOLUT = '4934f97e-7621-443e-94c1-be5729e87ef0';
const AIRCASH = '0716b12f-6723-4b60-a089-673e8187df0d';
const KES = 'd624d010-28e2-4cf1-894d-76247d8f9a8d';

const candidate = (over: Partial<TransferPairCandidate>): TransferPairCandidate => ({
  id: 'c1',
  amount: 50,
  date: '2026-08-11',
  payerWalletId: REVOLUT,
  receiverWalletId: AIRCASH,
  bankTransactionId: null,
  counterpartBankTransactionId: null,
  transferCounterpartOrigin: null,
  ...over,
});

describe('matchTransferPair', () => {
  it('Aircash izvod „Uplata na Aircash Google Pay" 50 € nađe Revolutov redak', () => {
    const r = matchTransferPair({
      amount: 50,
      date: '2026-08-11',
      statementWalletId: AIRCASH,
      direction: 'in',
      counterpartWalletId: null,
      fingerprint: 'imp:new',
      candidates: [candidate({})],
    });
    expect(r).toEqual({ kind: 'pair', existingId: 'c1', payerWalletId: REVOLUT, receiverWalletId: AIRCASH });
  });

  it('poznat counterpart mora se poklopiti s platiteljem', () => {
    expect(
      matchTransferPair({
        amount: 50,
        date: '2026-08-11',
        statementWalletId: AIRCASH,
        direction: 'in',
        counterpartWalletId: KES,
        candidates: [candidate({})],
      }).kind,
    ).toBe('none');
  });

  it('smjer „out" traži kandidata čiji je platitelj novčanik izvoda', () => {
    const r = matchTransferPair({
      amount: 60,
      date: '2026-08-11',
      statementWalletId: REVOLUT,
      direction: 'out',
      counterpartWalletId: AIRCASH,
      candidates: [candidate({ id: 'c2', amount: 60 })],
    });
    expect(r).toEqual({ kind: 'pair', existingId: 'c2', payerWalletId: REVOLUT, receiverWalletId: AIRCASH });
  });

  it('225 € s razmakom od jednog dana (13.8. ↔ 14.8.) je par', () => {
    const r = matchTransferPair({
      amount: 225,
      date: '2026-08-14',
      statementWalletId: AIRCASH,
      direction: 'in',
      candidates: [candidate({ id: 'c3', amount: 225, date: '2026-08-13' })],
    });
    expect(r.kind).toBe('pair');
  });

  it('granica ±3 dana je uključiva, četvrti dan nije', () => {
    const base = { amount: 225, statementWalletId: AIRCASH, direction: 'in' as const };
    expect(
      matchTransferPair({ ...base, date: '2026-08-16', candidates: [candidate({ amount: 225, date: '2026-08-13' })] }).kind,
    ).toBe('pair');
    expect(
      matchTransferPair({ ...base, date: '2026-08-17', candidates: [candidate({ amount: 225, date: '2026-08-13' })] }).kind,
    ).toBe('none');
  });

  it('ručni „Aircash dopuna" iz Keša je valjan kandidat', () => {
    const r = matchTransferPair({
      amount: 200,
      date: '2026-08-23',
      statementWalletId: AIRCASH,
      direction: 'in',
      fingerprint: 'imp2:abc',
      candidates: [candidate({ id: 'kes1', amount: 200, date: '2026-08-23', payerWalletId: KES })],
    });
    expect(r).toEqual({ kind: 'pair', existingId: 'kes1', payerWalletId: KES, receiverWalletId: AIRCASH });
  });

  it('dva jednaka kandidata → ambiguous, nikad pogađanje', () => {
    const r = matchTransferPair({
      amount: 200,
      date: '2026-08-23',
      statementWalletId: AIRCASH,
      direction: 'in',
      candidates: [
        candidate({ id: 'a', amount: 200, date: '2026-08-23', payerWalletId: KES }),
        candidate({ id: 'b', amount: 200, date: '2026-08-23', payerWalletId: REVOLUT }),
      ],
    });
    expect(r.kind).toBe('ambiguous');
    // Kandidati nose podatke za prikaz — bez njih korisnik ne može odlučiti.
    expect(r.kind === 'ambiguous' && r.candidateIds).toEqual(['a', 'b']);
    expect(r.kind === 'ambiguous' && r.candidates.map(c => c.id)).toEqual(['a', 'b']);
    expect(r.kind === 'ambiguous' && r.candidates[0].payerWalletId).toBe(KES);
  });

  it('otisak koji već stoji na kandidatu znači isti redak, ne par', () => {
    expect(
      matchTransferPair({
        amount: 50,
        date: '2026-08-11',
        statementWalletId: AIRCASH,
        direction: 'in',
        fingerprint: 'imp:xyz',
        candidates: [candidate({ counterpartBankTransactionId: 'imp:xyz' })],
      }),
    ).toEqual({ kind: 'same_row', existingId: 'c1' });
  });

  it('ispravak platitelja samo kad je postojeći redak pogođen pravilom', () => {
    const wrong = candidate({ id: 'w', payerWalletId: KES, transferCounterpartOrigin: 'rule' });
    const r = matchTransferPair({
      amount: 50,
      date: '2026-08-11',
      statementWalletId: AIRCASH,
      direction: 'in',
      counterpartWalletId: REVOLUT,
      candidates: [wrong],
    });
    expect(r).toEqual({
      kind: 'pair',
      existingId: 'w',
      payerWalletId: REVOLUT,
      receiverWalletId: AIRCASH,
      correctedPayerFrom: KES,
    });

    const manual = candidate({ id: 'm', payerWalletId: KES, transferCounterpartOrigin: 'manual' });
    expect(
      matchTransferPair({
        amount: 50,
        date: '2026-08-11',
        statementWalletId: AIRCASH,
        direction: 'in',
        counterpartWalletId: REVOLUT,
        candidates: [manual],
      }).kind,
    ).toBe('none');
  });

  it('bez kandidata → none', () => {
    expect(
      matchTransferPair({ amount: 99, date: '2026-08-11', statementWalletId: AIRCASH, direction: 'in', candidates: [] }),
    ).toEqual({ kind: 'none' });
  });
});
