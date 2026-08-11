/**
 * PONUDA SPAJANJA — kartično kašnjenje. Četiri tvrde ograde iz naloga:
 *  a) iznos identičan do centa
 *  b) jednosmjeran prozor: ručni PRIJE, izvod isti dan do +3 dana POSLIJE
 *  c) nikad automatsko spajanje (ovo je samo ponuda; plan to poštuje)
 *  d) jedan-na-jedan; inače aplikacija ŠUTI
 *
 * Živi primjeri iz korisnikovih knjiga (MAPEI/Kera Term, Građevinski/Baustoff).
 */
import { describe, it, expect } from 'vitest';
import { findLateCardMatches } from '../lateCardMatch';

const SRC = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SRC_B = 'custom:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const bank = (index: number, amount: number, date: string, source = SRC, type = 'expense') =>
  ({ index, amount, date: `${date}T09:00:00.000Z`, paymentSource: source, type });
const manual = (id: string, amount: number, date: string, source = SRC, type = 'expense') =>
  ({ id, amount, date: `${date}T18:00:00.000Z`, paymentSource: source, type });

describe('findLateCardMatches — pozitivni živi slučajevi', () => {
  it('MAPEI 8.8. 23,49 ↔ Kera Term 10.8. 23,49 = ponuda', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 23.49, '2026-08-10')],
      manualCandidates: [manual('m1', 23.49, '2026-08-08')],
    })).toEqual([{ importedIndex: 0, manualId: 'm1' }]);
  });

  it('Građevinski materijal 8.8. 42,43 ↔ Baustoff 10.8. 42,43 = ponuda', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 42.43, '2026-08-10')],
      manualCandidates: [manual('m1', 42.43, '2026-08-08')],
    })).toEqual([{ importedIndex: 0, manualId: 'm1' }]);
  });

  it('isti dan je unutar prozora', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 10, '2026-08-08')],
      manualCandidates: [manual('m1', 10, '2026-08-08')],
    })).toHaveLength(1);
  });
});

describe('findLateCardMatches — negativni čuvari', () => {
  it('a) 23,49 vs 23,50 → ništa', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 23.49, '2026-08-10')],
      manualCandidates: [manual('m1', 23.50, '2026-08-08')],
    })).toEqual([]);
  });

  it('b) izvod PRIJE ručnog → ništa', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 23.49, '2026-08-07')],
      manualCandidates: [manual('m1', 23.49, '2026-08-08')],
    })).toEqual([]);
  });

  it('b) izvod +4 dana → izvan prozora', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 23.49, '2026-08-12')],
      manualCandidates: [manual('m1', 23.49, '2026-08-08')],
    })).toEqual([]);
  });

  it('d) dva ručna po 15,00 u prozoru → šutnja', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 15, '2026-08-10')],
      manualCandidates: [manual('m1', 15, '2026-08-08'), manual('m2', 15, '2026-08-09')],
    })).toEqual([]);
  });

  it('d) dva retka izvoda na isti ručni unos → šutnja s obje strane', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 15, '2026-08-09'), bank(1, 15, '2026-08-10')],
      manualCandidates: [manual('m1', 15, '2026-08-08')],
    })).toEqual([]);
  });

  it('drugi novčanik → ništa', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 15, '2026-08-10')],
      manualCandidates: [manual('m1', 15, '2026-08-08', SRC_B)],
    })).toEqual([]);
  });

  it('različit tip (prihod vs rashod) → ništa; prijenos nikad', () => {
    expect(findLateCardMatches({
      imported: [bank(0, 15, '2026-08-10')],
      manualCandidates: [manual('m1', 15, '2026-08-08', SRC, 'income')],
    })).toEqual([]);
    expect(findLateCardMatches({
      imported: [bank(0, 15, '2026-08-10', SRC, 'transfer')],
      manualCandidates: [manual('m1', 15, '2026-08-08', SRC, 'transfer')],
    })).toEqual([]);
  });
});
