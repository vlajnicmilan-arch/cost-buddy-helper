/**
 * DRUGI KRUG UPARIVANJA — stupnjevani prozor, zauzeti kandidati, pretvorba
 * običnog primitka/troška u prijenos i podaci za odluku korisnika.
 * Stvarni slučajevi iz rujna 2026 (Aircash ↔ Revolut).
 */
import { describe, it, expect } from 'vitest';
import { matchTransferPair, type TransferPairCandidate } from '../transferPairMatch';
import { TRANSFER_KEYWORDS } from '../moneyDirection';

const REVOLUT = '4934f97e-7621-443e-94c1-be5729e87ef0';
const AIRCASH = '0716b12f-6723-4b60-a089-673e8187df0d';

const transfer = (over: Partial<TransferPairCandidate>): TransferPairCandidate => ({
  id: 'c1',
  amount: 30,
  date: '2026-09-08',
  payerWalletId: REVOLUT,
  receiverWalletId: AIRCASH,
  bankTransactionId: null,
  counterpartBankTransactionId: null,
  transferCounterpartOrigin: null,
  type: 'transfer',
  walletId: REVOLUT,
  description: null,
  origin: 'import',
  ...over,
});

const income = (over: Partial<TransferPairCandidate>): TransferPairCandidate => ({
  ...transfer(over),
  type: 'income',
  payerWalletId: null,
  receiverWalletId: null,
  walletId: REVOLUT,
  ...over,
});

describe('stupnjevani prozor', () => {
  it('(A) dvije nadoplate od 30 € u tjednu se ne miješaju — bliži dan pobjeđuje', () => {
    const candidates = [
      transfer({ id: 'r8', date: '2026-09-08' }),
      transfer({ id: 'r10', date: '2026-09-10' }),
    ];
    const first = matchTransferPair({
      amount: 30, date: '2026-09-07', statementWalletId: AIRCASH, direction: 'in', candidates,
    });
    expect(first).toMatchObject({ kind: 'pair', existingId: 'r8' });

    const second = matchTransferPair({
      amount: 30, date: '2026-09-09', statementWalletId: AIRCASH, direction: 'in', candidates,
      claimedCandidateIds: ['r8'],
    });
    expect(second).toMatchObject({ kind: 'pair', existingId: 'r10' });
  });

  it('zauzet kandidat se ne nudi drugi put', () => {
    const r = matchTransferPair({
      amount: 30, date: '2026-09-07', statementWalletId: AIRCASH, direction: 'in',
      candidates: [transfer({ id: 'r8' })],
      claimedCandidateIds: ['r8'],
    });
    expect(r.kind).toBe('none');
  });

  it('(C) razmak preko mjeseca (31.8. ↔ 1.9.) i dalje je par', () => {
    const r = matchTransferPair({
      amount: 50.95, date: '2026-08-31', statementWalletId: AIRCASH, direction: 'in',
      candidates: [transfer({ id: 'r1', amount: 50.95, date: '2026-09-01' })],
    });
    expect(r).toMatchObject({ kind: 'pair', existingId: 'r1' });
  });
});

describe('pretvorba običnog retka u prijenos', () => {
  it('(B) Revolut primitak „nadoplata od Google Pay do *1664" JE druga strana', () => {
    const r = matchTransferPair({
      amount: 100, date: '2026-09-15', statementWalletId: AIRCASH, direction: 'in',
      candidates: [income({
        id: 'inc1', amount: 100, date: '2026-09-15',
        description: 'nadoplata od Google Pay do *1664',
      })],
      cardLast4: ['1664'],
      transferKeywords: TRANSFER_KEYWORDS,
    });
    expect(r).toMatchObject({ kind: 'pair', existingId: 'inc1', convert: true, convertSignal: 'card' });
  });

  it('bez kartice i bez ključne riječi običan primitak NIJE kandidat', () => {
    const r = matchTransferPair({
      amount: 100, date: '2026-09-15', statementWalletId: AIRCASH, direction: 'in',
      candidates: [income({ id: 'inc1', amount: 100, description: 'Plaća' })],
      cardLast4: ['1664'],
      transferKeywords: TRANSFER_KEYWORDS,
    });
    expect(r.kind).toBe('none');
  });

  it('bez kartice smjer mora biti ispravan — kod „in" druga strana je trošak', () => {
    const base = { amount: 100, date: '2026-09-15', statementWalletId: AIRCASH, direction: 'in' as const,
      transferKeywords: TRANSFER_KEYWORDS };
    const wrong = matchTransferPair({
      ...base,
      candidates: [income({ id: 'inc1', type: 'income', amount: 100, date: '2026-09-15', description: 'uplata na aircash' })],
    });
    expect(wrong.kind).toBe('none');
    const right = matchTransferPair({
      ...base,
      candidates: [income({ id: 'exp1', type: 'expense', amount: 100, date: '2026-09-15', description: 'uplata na aircash' })],
    });
    expect(right).toMatchObject({ kind: 'pair', existingId: 'exp1', convert: true, convertSignal: 'keyword' });
  });

  it('pravi prijenos ima prednost pred pretvorbom', () => {
    const r = matchTransferPair({
      amount: 30, date: '2026-09-08', statementWalletId: AIRCASH, direction: 'in',
      candidates: [
        income({ id: 'inc1', description: 'nadoplata *1664' }),
        transfer({ id: 'tr1' }),
      ],
      cardLast4: ['1664'],
    });
    expect(r).toMatchObject({ kind: 'pair', existingId: 'tr1' });
  });
});

describe('dvosmislenost nosi podatke za odluku', () => {
  it('kandidati imaju datum, iznos, strane, opis i porijeklo', () => {
    const r = matchTransferPair({
      amount: 30, date: '2026-09-08', statementWalletId: AIRCASH, direction: 'in',
      candidates: [
        transfer({ id: 'a', description: 'Uplata A', origin: 'import' }),
        transfer({ id: 'b', description: 'Uplata B', origin: 'sync' }),
      ],
    });
    expect(r.kind).toBe('ambiguous');
    if (r.kind !== 'ambiguous') return;
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({
      id: 'a', amount: 30, description: 'Uplata A', origin: 'import', convert: false,
    });
    expect(r.candidates[1].origin).toBe('sync');
  });
});
