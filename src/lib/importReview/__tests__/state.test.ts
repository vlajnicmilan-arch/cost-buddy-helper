import { describe, expect, it } from 'vitest';
import {
  answerQuestion,
  buildInitialDecisions,
  isNewRowLocked,
  setAutoMerge,
  setNewRow,
  summarize,
} from '../state';
import type { ImportReviewPayload } from '../types';

const payload: ImportReviewPayload = {
  jobId: 'job-1',
  sourceId: 'src-1',
  sourceName: 'Revolut',
  createdAt: 0,
  manualCandidates: {
    'm1': { id: 'm1', date: '2026-07-14', amount: 100, type: 'expense', merchantName: 'Ale Hop' },
    'm2': { id: 'm2', date: '2026-07-14', amount: 100, type: 'expense', merchantName: 'Ale Hop 2' },
  },
  rows: [
    { index: 0, date: '2026-07-14', amount: 11, type: 'expense', merchantName: 'ALE-HOP',
      classification: { kind: 'auto_merge', manualId: 'm1' } },
    { index: 1, date: '2026-07-14', amount: 4.8, type: 'expense', merchantName: 'Pos Apm',
      classification: { kind: 'question', reason: 'ambiguous', candidateIds: ['m1', 'm2'] } },
    { index: 2, date: '2026-07-14', amount: 30, type: 'expense', merchantName: 'LOVABLE',
      classification: { kind: 'new', existsByFingerprint: false } },
    { index: 3, date: '2026-07-14', amount: 34.8, type: 'expense', merchantName: 'Jadrolinija',
      classification: { kind: 'new', existsByFingerprint: true } },
  ],
};

describe('importReview/state', () => {
  it('builds initial decisions per §4 defaults', () => {
    const d = buildInitialDecisions(payload);
    expect(d.autoMerge[0]).toBe(true);        // auto default ON
    expect(d.questions[1]).toBeNull();         // no default
    expect(d.newRows[2]).toBe(true);           // new default ON
    expect(d.newRows[3]).toBe(false);          // fingerprint hit → OFF
  });

  it('isNewRowLocked flags fingerprint-hit new rows', () => {
    expect(isNewRowLocked(payload.rows[2])).toBe(false);
    expect(isNewRowLocked(payload.rows[3])).toBe(true);
    expect(isNewRowLocked(payload.rows[0])).toBe(false);
  });

  it('gating: canConfirm=false while any question unanswered', () => {
    const d = buildInitialDecisions(payload);
    const s = summarize(payload, d);
    expect(s.totalQuestions).toBe(1);
    expect(s.answeredQuestions).toBe(0);
    expect(s.canConfirm).toBe(false);
  });

  it('gating: canConfirm=true once all questions answered', () => {
    let d = buildInitialDecisions(payload);
    d = answerQuestion(d, 1, { choice: 'merge', manualId: 'm1' });
    const s = summarize(payload, d);
    expect(s.canConfirm).toBe(true);
    expect(s.plannedMerges).toBe(2);   // auto #0 + question #1
    expect(s.plannedNew).toBe(1);      // #2
    expect(s.plannedSkipped).toBe(1);  // #3 fp-hit
  });

  it('toggling auto-merge OFF moves row to skipped', () => {
    let d = buildInitialDecisions(payload);
    d = setAutoMerge(d, 0, false);
    d = answerQuestion(d, 1, { choice: 'new' });
    const s = summarize(payload, d);
    expect(s.plannedMerges).toBe(0);
    expect(s.plannedNew).toBe(2);     // #1 as new + #2
    expect(s.plannedSkipped).toBe(2); // #0 unchecked + #3 fp-hit
  });

  it('toggling new-row OFF moves to skipped without affecting fp-hit', () => {
    let d = buildInitialDecisions(payload);
    d = setNewRow(d, 2, false);
    d = answerQuestion(d, 1, { choice: 'new' });
    const s = summarize(payload, d);
    expect(s.plannedNew).toBe(1);
    expect(s.plannedSkipped).toBe(2);
  });
});
