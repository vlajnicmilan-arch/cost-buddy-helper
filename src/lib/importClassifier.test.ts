import { describe, it, expect } from 'vitest';
import { classifyImport } from './importClassifier';

const SRC = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SRC_B = 'custom:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const day = (s: string) => new Date(`${s}T12:00:00.000Z`);

describe('classifyImport — 4 grane', () => {
  it('merchant se slaže (case + crtica + razmaci) → autoMerge', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 11, date: day('2026-06-10'), merchantName: 'ALE-HOP' }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 11, date: day('2026-06-10'), merchantName: 'Ale Hop' }],
    });
    expect(out.autoMerge).toEqual([{ importedIndex: 0, manualId: 'm1' }]);
    expect(out.questions).toEqual([]);
    expect(out.newRows).toEqual([]);
  });

  it('merchant se ne slaže → question(merchant_mismatch)', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 5.95, date: day('2026-06-10'), merchantName: 'Bipa' }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 5.95, date: day('2026-06-10'), merchantName: 'Muller' }],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toEqual([{ importedIndex: 0, reason: 'merchant_mismatch', candidateIds: ['m1'] }]);
    expect(out.newRows).toEqual([]);
  });

  it('ručni bez merchant_name → question(no_merchant), description NIJE odluka', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 100, date: day('2026-06-10'), merchantName: 'Konzum' }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 100, date: day('2026-06-10'), merchantName: null, description: 'Konzum kupovina' }],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toEqual([{ importedIndex: 0, reason: 'no_merchant', candidateIds: ['m1'] }]);
  });

  it('više kandidata za jedan bank red → question(ambiguous)', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 4.8, date: day('2026-06-10'), merchantName: 'Pos Apm' }],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 4.8, date: day('2026-06-10'), merchantName: 'Pos Apm' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 4.8, date: day('2026-06-11'), merchantName: 'Pos Apm' },
      ],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0].reason).toBe('ambiguous');
    expect(out.questions[0].candidateIds.sort()).toEqual(['m1', 'm2']);
  });
});

describe('classifyImport — rubni slučajevi', () => {
  it('cross-ambiguous: dva bank reda ciljaju isti kandidat → oba ambiguous', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 10, date: day('2026-06-10'), merchantName: 'Konzum' },
        { index: 1, paymentSource: SRC, type: 'expense', amount: 10, date: day('2026-06-10'), merchantName: 'Konzum' },
      ],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 10, date: day('2026-06-10'), merchantName: 'Konzum' }],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toHaveLength(2);
    for (const q of out.questions) expect(q.reason).toBe('ambiguous');
  });

  it('bez kandidata → newRows', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 42, date: day('2026-06-10'), merchantName: 'Foo' }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_B, type: 'expense', amount: 42, date: day('2026-06-10'), merchantName: 'Foo' }],
    });
    expect(out.newRows).toEqual([0]);
  });

  it('transfer se nikad ne auto-mergea → newRows', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'transfer', amount: 100, date: day('2026-06-10'), merchantName: 'Aircash' }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'transfer', amount: 100, date: day('2026-06-10'), merchantName: 'Aircash' }],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.newRows).toEqual([0]);
  });

  it('normalizacija: interpunkcija + geo tokeni ("RIBOLA PR 34, SPLIT, 000, HR" ≡ "RIBOLA")', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 12.92, date: day('2026-06-15'), merchantName: 'RIBOLA PR 34, SPLIT, 000, HR' }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 12.92, date: day('2026-06-15'), merchantName: 'Ribola' }],
    });
    expect(out.autoMerge).toEqual([{ importedIndex: 0, manualId: 'm1' }]);
  });

  it('±1 dan granica se poštuje; 2 dana → nema kandidata', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 30, date: day('2026-06-10'), merchantName: 'Foo' }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 30, date: day('2026-06-12'), merchantName: 'Foo' }],
    });
    expect(out.newRows).toEqual([0]);
  });

  it('bank merchant prazan + manual ima merchant → no_merchant question', () => {
    const out = classifyImport({
      imported: [{ index: 0, paymentSource: SRC, type: 'expense', amount: 7, date: day('2026-06-10'), merchantName: null }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC, type: 'expense', amount: 7, date: day('2026-06-10'), merchantName: 'Kafic' }],
    });
    expect(out.questions).toEqual([{ importedIndex: 0, reason: 'no_merchant', candidateIds: ['m1'] }]);
  });
});
