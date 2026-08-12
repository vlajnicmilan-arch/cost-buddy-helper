import { describe, it, expect } from 'vitest';
import { classifyImport, type ClassifierImportedRow, type ClassifierManualCandidate } from '@/lib/importClassifier';
import { findLateCardMatches } from '../lateCardMatch';

/**
 * Sužavanje imenom smanjuje "zauzeti" (claimed) skup ručnih unosa, pa ponuda
 * kasne kartice može postati ŠIRA. To je dopušteno — ponuda je i dalje samo
 * ponuda (zadano razdvojeno), nikad tiho spajanje.
 */
const SRC = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const day = (s: string) => new Date(`${s}T12:00:00.000Z`);

const imported: ClassifierImportedRow[] = [
  { index: 0, paymentSource: SRC, type: 'expense', amount: 100, date: day('2026-02-10'), merchantName: 'Konzum' },
  { index: 1, paymentSource: SRC, type: 'expense', amount: 100, date: day('2026-02-12'), merchantName: 'MAPEI SILIKON' },
];
const manualCandidates: ClassifierManualCandidate[] = [
  { id: 'm1', paymentSource: SRC, type: 'expense', amount: 100, date: day('2026-02-10'), merchantName: 'Konzum' },
  { id: 'm2', paymentSource: SRC, type: 'expense', amount: 100, date: day('2026-02-10'), merchantName: 'Ana Milanovic' },
];

describe('sužavanje ↔ ponuda kasne kartice', () => {
  it('izbačeni kandidat postaje slobodan za PONUDU (ne za spajanje)', () => {
    const classified = classifyImport({ imported, manualCandidates });
    expect(classified.autoMerge).toEqual([]);
    expect(classified.questions[0].candidateIds).toEqual(['m1']); // m2 izbačen imenom

    const claimed = new Set<string>([
      ...classified.autoMerge.map(p => p.manualId),
      ...classified.questions.flatMap(q => q.candidateIds),
    ]);
    expect(claimed.has('m2')).toBe(false);

    const newSet = new Set(classified.newRows);
    const offers = findLateCardMatches({
      imported: imported.filter(r => newSet.has(r.index)),
      manualCandidates: manualCandidates.filter(c => !claimed.has(c.id)),
    });
    expect(offers).toEqual([{ importedIndex: 1, manualId: 'm2' }]);
  });
});
