import { describe, it, expect } from 'vitest';
import { classifyImport } from '@/lib/importClassifier';

const SRC = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const day = (s: string) => new Date(`${s}T12:00:00.000Z`);

describe('automatsko uparivanje nerazlučivih kandidata', () => {
  it('4 naknade 0,21 × 4 kandidata → 4 para, 0 pitanja, nijedan kandidat dvaput', () => {
    const out = classifyImport({
      imported: [0, 1, 2, 3].map(i => ({
        index: i,
        paymentSource: SRC,
        type: 'expense',
        amount: 0.21,
        date: day(i < 2 ? '2026-02-09' : '2026-02-10'),
        merchantName: 'Naknada za plaćanje',
      })),
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 0.21, date: day('2026-02-09'), merchantName: 'Naknada' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 0.21, date: day('2026-02-09'), merchantName: 'Naknada za plaćanje' },
        { id: 'm3', paymentSource: SRC, type: 'expense', amount: 0.21, date: day('2026-02-10'), merchantName: 'Naknada' },
        { id: 'm4', paymentSource: SRC, type: 'expense', amount: 0.21, date: day('2026-02-10'), merchantName: 'Naknada za plaćanje' },
      ],
    });
    expect(out.questions).toEqual([]);
    expect(out.newRows).toEqual([]);
    expect(out.autoMerge).toHaveLength(4);
    expect(out.autoMerge.every(p => p.origin === 'indistinguishable')).toBe(true);
    const used = out.autoMerge.map(p => p.manualId).sort();
    expect(used).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('imena se razlikuju (Kristina Cerina / Ana Milanovic) → nema uparivanja', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Kristina Cerina' },
        { index: 1, paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Ana Milanovic' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Kristina Cerina' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Ana Milanovic' },
      ],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toHaveLength(2);
    expect(out.questions[0].candidateIds).toEqual(['m1']);
    expect(out.questions[1].candidateIds).toEqual(['m2']);
  });

  it('jedna strana bez imena → pitanje, nema uparivanja', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 0.21, date: day('2026-02-09'), merchantName: 'Naknada' },
        { index: 1, paymentSource: SRC, type: 'expense', amount: 0.21, date: day('2026-02-09'), merchantName: 'Naknada' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 0.21, date: day('2026-02-09'), merchantName: null },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 0.21, date: day('2026-02-09'), merchantName: 'Naknada' },
      ],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toHaveLength(2);
  });

  it('iznos 23,49 vs 23,50 → nikad par', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 23.49, date: day('2026-02-09'), merchantName: 'Naknada' },
        { index: 1, paymentSource: SRC, type: 'expense', amount: 23.5, date: day('2026-02-09'), merchantName: 'Naknada' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 23.49, date: day('2026-02-09'), merchantName: 'Naknada' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 23.5, date: day('2026-02-09'), merchantName: 'Naknada' },
      ],
    });
    // Svaki redak ima točno jednog kandidata → klasični put (merchant match).
    expect(out.autoMerge.every(p => p.origin === 'merchant')).toBe(true);
    expect(out.autoMerge).toHaveLength(2);
  });
});

describe('opis ulazi u odluku o spajanju', () => {
  it('OTP banka je stop-vrijednost: stvarni paket i 4 naknade idu u 5 autoMerge parova bez pitanja', () => {
    const imported = [
      { index: 0, amount: 8, date: '2026-02-09', description: '1609, Naknada za paket' },
      { index: 1, amount: 0.21, date: '2026-02-09', description: '1612, Naknada za plaćanje' },
      { index: 2, amount: 0.21, date: '2026-02-09', description: '1615, Naknada' },
      { index: 3, amount: 0.21, date: '2026-02-10', description: '1624, Naknada za plaćanje' },
      { index: 4, amount: 0.21, date: '2026-02-10', description: '1627, Naknada' },
    ].map((row) => ({ ...row, paymentSource: SRC, type: 'expense', merchantName: 'OTP banka' }));
    const manualCandidates = [
      { id: 'paket', amount: 8, date: '2026-02-09', description: 'Naknada za paket' },
      { id: 'm1', amount: 0.21, date: '2026-02-09', description: 'Naknada za plaćanje' },
      { id: 'm2', amount: 0.21, date: '2026-02-09', description: 'Naknada' },
      { id: 'm3', amount: 0.21, date: '2026-02-10', description: 'Naknada za plaćanje' },
      { id: 'm4', amount: 0.21, date: '2026-02-10', description: 'Naknada' },
    ].map((row) => ({ ...row, paymentSource: SRC, type: 'expense', merchantName: null }));

    const out = classifyImport({ imported, manualCandidates, statementBankName: 'OTP banka' });
    expect(out.questions).toEqual([]);
    expect(out.autoMerge).toHaveLength(5);
    expect(new Set(out.autoMerge.map((pair) => pair.manualId)).size).toBe(5);
  });

  it('stop-vrijednost vrijedi i na ručnom kandidatu, ali Kristina/Ana ostaju pitanje', () => {
    expect(deriveComparableName({
      merchantName: 'OTP banka',
      description: 'Naknada za paket',
      statementBankName: 'OTP',
    })).toBe('naknada za paket');

    const out = classifyImport({
      statementBankName: 'OTP banka',
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Kristina Cerina' },
        { index: 1, paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Ana Milanovic' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Kristina Cerina' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Ana Milanovic' },
      ],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toHaveLength(2);
  });

  it('"Naknada za paket" samo u opisu s obje strane, 1 kandidat → autoMerge', () => {
    const out = classifyImport({
      imported: [{
        index: 0, paymentSource: SRC, type: 'expense', amount: 1.99, date: day('2026-02-11'),
        merchantName: null, description: 'Naknada za paket',
      }],
      manualCandidates: [{
        id: 'm1', paymentSource: SRC, type: 'expense', amount: 1.99, date: day('2026-02-11'),
        merchantName: null, description: 'Naknada za paket',
      }],
    });
    expect(out.autoMerge).toEqual([{ importedIndex: 0, manualId: 'm1', origin: 'merchant' }]);
    expect(out.questions).toEqual([]);
  });

  it('MAPEI ↔ Kera Term (1 kandidat, imena različita) → merchant_mismatch', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 39.9, date: day('2026-02-13'), merchantName: 'MAPEI SILIKON' }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 39.9, date: day('2026-02-13'), merchantName: 'Kera Term Trgovina, Zadar' }],
    });
    expect(out.questions).toEqual([{ importedIndex: 0, reason: 'merchant_mismatch', candidateIds: ['m1'] }]);
  });

  it('nijedna strana nema ime → no_merchant pitanje', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 7, date: day('2026-02-11'), merchantName: null, description: null }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 7, date: day('2026-02-11'), merchantName: null, description: null }],
    });
    expect(out.questions).toEqual([{ importedIndex: 0, reason: 'no_merchant', candidateIds: ['m1'] }]);
  });
});
