/**
 * Nalog 3 — uvoz izvoda na pravilu „isti trošak".
 * Stvarni tekstovi (kolovoz 2026); id-evi i vlasnik izmišljeni.
 */
import { describe, it, expect } from 'vitest';
import { classifyImport, type ClassifierImportedRow, type ClassifierManualCandidate } from '@/lib/importClassifier';
import { matchImportRowsBySameExpense, decideImportSameExpense } from '@/lib/importReview/sameExpenseImport';

const OWNER = 'aa000000-0000-4000-8000-000000000001';
const OTHER = 'bb000000-0000-4000-8000-000000000002';
const WALLET = 'custom:cc000000-0000-4000-8000-000000000003';
const CTX = { userId: OWNER, cardWallets: {} };

/** Lokalna ponoć — isto kao `tx.date` iz parsera izvoda. */
const localDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

const bankRow = (index: number, amount: number, date: string, text: string, counterparty?: string): ClassifierImportedRow => ({
  index, paymentSource: WALLET, type: 'expense', amount, date: localDay(date),
  merchantName: counterparty ?? text, description: text,
});
const manualRow = (id: string, amount: number, date: string, merchant: string, over: Partial<ClassifierManualCandidate> = {}): ClassifierManualCandidate => ({
  id, userId: OWNER, paymentSource: WALLET, type: 'expense', amount,
  // Zapis kakav stoji u bazi: lokalna ponoć kao UTC vremenska oznaka.
  date: localDay(date).toISOString(), merchantName: merchant, description: null,
  bankMatchStatus: 'pending_bank', ...over,
});

const PAIRS = [
  { name: 'Baustoff 110,49', m: manualRow('m1', 110.49, '2026-08-07', 'Baustoff + Metall'), b: bankRow(0, 110.49, '2026-08-09', 'Baustoff + Metall, Zadar [Card *1542]') },
  { name: 'Lignum 126,29', m: manualRow('m2', 126.29, '2026-08-07', 'Lignum'), b: bankRow(1, 126.29, '2026-08-09', 'Lignum Gradevinski Mat, Zadar [Card *1542]') },
  { name: 'Aleta 60,75', m: manualRow('m3', 60.75, '2026-08-07', 'Aleta'), b: bankRow(2, 60.75, '2026-08-09', 'Aleta P-1, Zadar [Card *1542]') },
  { name: 'Aleta 7,65', m: manualRow('m4', 7.65, '2026-07-31', 'Aleta'), b: bankRow(3, 7.65, '2026-08-02', 'Aleta P 1 - Aleta P-1, Zadar [Card *1542]') },
  { name: 'Baustoff 102,74', m: manualRow('m5', 102.74, '2026-07-31', 'Baustoff + Metall'), b: bankRow(4, 102.74, '2026-08-02', 'Baustoff + Metall, Zadar [Card *1542]') },
];

describe('classifyImport + pravilo „isti trošak"', () => {
  for (const p of PAIRS) {
    it(`${p.name} → auto_merge (merchant), kartica kasni 2 dana`, () => {
      const out = classifyImport({ imported: [{ ...p.b, index: 0 }], manualCandidates: [p.m], sameExpense: CTX });
      expect(out.autoMerge).toEqual([{ importedIndex: 0, manualId: p.m.id, origin: 'merchant' }]);
      expect(out.questions).toEqual([]);
    });
    it(`${p.name} → bez pravila (stari prozor ±1) NE spaja sam`, () => {
      const out = classifyImport({ imported: [{ ...p.b, index: 0 }], manualCandidates: [p.m] });
      expect(out.autoMerge).toEqual([]);
    });
  }

  it('svih pet parova u jednom izvodu → svih pet auto_merge', () => {
    const out = classifyImport({ imported: PAIRS.map(p => p.b), manualCandidates: PAIRS.map(p => p.m), sameExpense: CTX });
    expect(out.autoMerge.map(a => [a.importedIndex, a.manualId]).sort()).toEqual(PAIRS.map(p => [p.b.index, p.m.id]).sort());
    expect(out.questions).toEqual([]);
    expect(out.newRows).toEqual([]);
  });

  it('Hrvatske autoceste 17,60 ↔ dva retka istog dana → pitanje, nijedno spajanje', () => {
    const m = manualRow('m-hac', 17.6, '2026-08-11', 'Hrvatske autoceste', { description: 'Cestarina Zagreb - Zadar Centar' });
    const rows = [
      bankRow(0, 17.6, '2026-08-11', 'Hrvatske autoceste Dionica Zagreb-bosilje [Visa *1542]', 'Autocesta A1 Rovanjska, Knin'),
      bankRow(1, 17.6, '2026-08-11', 'Hrvatske autoceste [Visa *1542]', 'Autocesta A1 Rovanjska, Knin'),
    ];
    const out = classifyImport({ imported: rows, manualCandidates: [m], sameExpense: CTX });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toEqual([
      { importedIndex: 0, reason: 'ambiguous', candidateIds: ['m-hac'] },
      { importedIndex: 1, reason: 'ambiguous', candidateIds: ['m-hac'] },
    ]);
  });

  it('kandidat drugog vlasnika nikad se ne spaja', () => {
    const p = PAIRS[0];
    const out = classifyImport({ imported: [p.b], manualCandidates: [{ ...p.m, userId: OTHER }], sameExpense: CTX });
    expect(out.autoMerge).toEqual([]);
  });

  it('kandidat bez user_id iz baze nikad se ne spaja', () => {
    const p = PAIRS[0];
    const out = classifyImport({ imported: [p.b], manualCandidates: [{ ...p.m, userId: undefined }], sameExpense: CTX });
    expect(out.autoMerge).toEqual([]);
  });

  it('ručni bez imena → pitanje no_merchant (uncertain)', () => {
    const m = manualRow('m-x', 42.1, '2026-08-07', '', { merchantName: null });
    const out = classifyImport({ imported: [bankRow(0, 42.1, '2026-08-09', 'Konzum, Zadar')], manualCandidates: [m], sameExpense: CTX });
    expect(out.questions).toEqual([{ importedIndex: 0, reason: 'no_merchant', candidateIds: ['m-x'] }]);
  });

  it('prijenos ne ulazi u pravilo', () => {
    const b = { ...PAIRS[0].b, type: 'transfer' };
    const m = { ...PAIRS[0].m, type: 'transfer' };
    const out = classifyImport({ imported: [b], manualCandidates: [m], sameExpense: CTX });
    expect(out.autoMerge).toEqual([]);
    expect(out.newRows).toEqual([0]);
  });

  it('izvod 3 dana prije ručnog → izvan prozora (none)', () => {
    const d = decideImportSameExpense(CTX, [bankRow(0, 110.49, '2026-08-05', 'Baustoff + Metall, Zadar')], [PAIRS[0].m]);
    expect(d[0].outcome).toBe('none');
  });
});

describe('CSV put — isto pravilo', () => {
  for (const p of PAIRS) {
    it(`${p.name} → match`, () => {
      const res = matchImportRowsBySameExpense(CTX, [{ ...p.b, index: 0 }], [p.m]);
      expect(res.matches).toEqual([{ importedIndex: 0, manualId: p.m.id }]);
    });
  }
  it('cestarina → nijedno spajanje', () => {
    const m = manualRow('m-hac', 17.6, '2026-08-11', 'Hrvatske autoceste', { description: 'Cestarina Zagreb - Zadar Centar' });
    const res = matchImportRowsBySameExpense(CTX, [
      bankRow(0, 17.6, '2026-08-11', 'Hrvatske autoceste Dionica Zagreb-bosilje [Visa *1542]', 'Autocesta A1 Rovanjska, Knin'),
      bankRow(1, 17.6, '2026-08-11', 'Hrvatske autoceste [Visa *1542]', 'Autocesta A1 Rovanjska, Knin'),
    ], [m]);
    expect(res.matches).toEqual([]);
  });
});
