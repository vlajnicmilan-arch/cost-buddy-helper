import { describe, it, expect } from 'vitest';
import { classifyImport } from '@/lib/importClassifier';
import { deriveComparableName, hasSignificantWord } from '../comparableName';

const SRC = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const day = (s: string) => new Date(`${s}T12:00:00.000Z`);

describe('deriveComparableName', () => {
  it('prioritet merchantName → description', () => {
    expect(deriveComparableName({ merchantName: 'Konzum', description: 'kava' })).toBe('konzum');
    expect(deriveComparableName({ merchantName: null, description: 'Naknada za plaćanje' }))
      .toContain('naknada');
  });

  it('tehnički tokeni ispadaju iz imena', () => {
    const name = deriveComparableName({
      merchantName: '462765XXXXXX7262, d7cb0d49-9eec-4daa-ab63-6dad78ae4e9d, KONZUM',
    });
    expect(name).toBe('konzum');
  });

  it('značajna riječ traži >= 3 znaka', () => {
    expect(hasSignificantWord('ab')).toBe(false);
    expect(hasSignificantWord('abc')).toBe(true);
  });
});

describe('sužavanje kandidata imenom (faza 2.5)', () => {
  it('Kristina Cerina ↔ Ana Milanovic — razdvaja se, pitanje ostaje s jednim kandidatom', () => {
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
    expect(out.autoMerge).toEqual([]); // ograda (c): nula novih tihih spajanja
    expect(out.questions).toHaveLength(2);
    expect(out.questions[0].candidateIds).toEqual(['m1']);
    expect(out.questions[1].candidateIds).toEqual(['m2']);
  });

  it('Naknada ↔ Naknada za plaćanje — NE razdvaja', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 1.5, date: day('2026-02-11'), merchantName: 'Naknada za plaćanje' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 1.5, date: day('2026-02-11'), merchantName: 'Naknada' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 1.5, date: day('2026-02-11'), merchantName: 'Naknada za plaćanje' },
      ],
    });
    expect(out.questions[0].candidateIds.sort()).toEqual(['m1', 'm2']);
  });

  it('KEKS PAY/ZAGREB ↔ KEKS PAY — NE razdvaja', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 20, date: day('2026-02-12'), merchantName: 'KEKS PAY/ZAGREB' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 20, date: day('2026-02-12'), merchantName: 'KEKS PAY' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 20, date: day('2026-02-12'), merchantName: 'Keks Pay' },
      ],
    });
    expect(out.questions[0].candidateIds.sort()).toEqual(['m1', 'm2']);
  });

  it('TOČNO JEDAN kandidat s drugim imenom ostaje netaknut (MAPEI ↔ Kera Term)', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 39.9, date: day('2026-02-13'), merchantName: 'MAPEI SILIKON' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 39.9, date: day('2026-02-13'), merchantName: 'Kera Term Trgovina, Zadar' },
      ],
    });
    expect(out.questions).toEqual([
      { importedIndex: 0, reason: 'merchant_mismatch', candidateIds: ['m1'] },
    ]);
  });

  it('sužavanje koje bi ispraznilo skup vraća PUNI skup — pitanje nikad ne postaje "novo"', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 8, date: day('2026-02-14'), merchantName: 'Bipa' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 8, date: day('2026-02-14'), merchantName: 'Muller' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 8, date: day('2026-02-14'), merchantName: 'Lidl' },
      ],
    });
    expect(out.newRows).toEqual([]);
    expect(out.questions[0].candidateIds.sort()).toEqual(['m1', 'm2']);
  });

  it('INVARIJANTA: sužavanje ne stvara nijedan novi autoMerge par', () => {
    const imported = [
      { index: 0, paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Kristina Cerina' },
      { index: 1, paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Ana Milanovic' },
      { index: 2, paymentSource: SRC, type: 'expense', amount: 11, date: day('2026-02-10'), merchantName: 'ALE-HOP' },
    ];
    const manualCandidates = [
      { id: 'm1', paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Kristina Cerina' },
      { id: 'm2', paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Ana Milanovic' },
      { id: 'm3', paymentSource: SRC, type: 'expense', amount: 11, date: day('2026-02-10'), merchantName: 'Ale Hop' },
    ];
    const out = classifyImport({ imported, manualCandidates });
    // Jedini autoMerge je onaj koji je i prije postojao: 1 kandidat + isti trgovac.
    expect(out.autoMerge).toEqual([{ importedIndex: 2, manualId: 'm3', origin: 'merchant' }]);
  });
});

describe('pozitivna potvrda imenom spaja (uzak rez)', () => {
  it('"Plaćanje Kristina Cerina" + jedini kandidat "Kristina Cerina" → autoMerge', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 10, date: day('2026-02-10'), merchantName: 'Plaćanje Kristina Cerina' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 10, date: day('2026-02-10'), merchantName: 'Kristina Cerina' },
      ],
    });
    expect(out.questions).toEqual([]);
    expect(out.autoMerge).toEqual([{ importedIndex: 0, manualId: 'm1', origin: 'merchant' }]);
  });

  it('dva kandidata prije sužavanja → nakon sužavanja 1 → autoMerge, Ana netaknuta', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Plaćanje Kristina Cerina' },
        { index: 1, paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Plaćanje Ana Milanovic' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Kristina Cerina' },
        { id: 'm2', paymentSource: SRC, type: 'expense', amount: 50, date: day('2026-02-10'), merchantName: 'Ana Milanovic' },
      ],
    });
    expect(out.questions).toEqual([]);
    expect(out.autoMerge).toEqual([
      { importedIndex: 0, manualId: 'm1', origin: 'merchant' },
      { importedIndex: 1, manualId: 'm2', origin: 'merchant' },
    ]);
  });

  it('MAPEI SILIKON s jednim kandidatom "Kera Term" → I DALJE pitanje', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 39.9, date: day('2026-02-13'), merchantName: 'Plaćanje MAPEI SILIKON' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 39.9, date: day('2026-02-13'), merchantName: 'Kera Term Trgovina, Zadar' },
      ],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions).toEqual([{ importedIndex: 0, reason: 'merchant_mismatch', candidateIds: ['m1'] }]);
  });

  it('jedna strana bez imena → pitanje', () => {
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 7, date: day('2026-02-10'), merchantName: null },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 7, date: day('2026-02-10'), merchantName: 'Kafic' },
      ],
    });
    expect(out.autoMerge).toEqual([]);
    expect(out.questions[0].reason).toBe('no_merchant');
  });

  it('"Naknada za plaćanje" ↔ "Naknada" i dalje se poklapaju', () => {
    expect(deriveComparableName({ merchantName: 'Naknada za plaćanje' })).toBe('naknada za placanje');
    const out = classifyImport({
      imported: [
        { index: 0, paymentSource: SRC, type: 'expense', amount: 1.5, date: day('2026-02-11'), merchantName: 'Naknada za plaćanje' },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC, type: 'expense', amount: 1.5, date: day('2026-02-11'), merchantName: 'Naknada' },
      ],
    });
    expect(out.autoMerge).toEqual([{ importedIndex: 0, manualId: 'm1', origin: 'merchant' }]);
  });
});
