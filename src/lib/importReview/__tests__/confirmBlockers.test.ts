import { describe, expect, it } from 'vitest';
import { buildBlockerMessages, firstBlockingRowIndex } from '../confirmBlockers';
import { buildInitialDecisions, setTransferDecision, summarize, answerQuestion } from '../state';
import type { ImportReviewPayload } from '../types';

const t = (key: string, params?: Record<string, unknown>) =>
  `${key}:${params?.count ?? ''}`;

const payload: ImportReviewPayload = {
  jobId: 'job-1',
  sourceId: 'src-1',
  sourceName: 'PBZ',
  createdAt: 0,
  importedTransactions: [],
  batchId: 'b1',
  availableTargets: [],
  manualCandidates: {},
  rows: [
    { index: 0, date: '2026-02-27', amount: 50, type: 'expense', merchantName: 'BANKOMAT',
      classification: { kind: 'transfer', targetIncomeSourceId: '', ruleId: null } as never },
    { index: 1, date: '2026-02-27', amount: 4.8, type: 'expense', merchantName: 'POS',
      classification: { kind: 'question', reason: 'ambiguous', candidateIds: [] } },
  ],
};

describe('confirmBlockers', () => {
  it('poruka nabraja oba uzroka s brojkama', () => {
    const d = buildInitialDecisions(payload);
    const s = summarize(payload, d);
    expect(buildBlockerMessages(s, t)).toEqual([
      'importReview.blockers.transfers:1',
      'importReview.blockers.questions:1',
    ]);
  });

  it('nema poruke kad ništa ne koči', () => {
    expect(buildBlockerMessages({ unresolvedTransfers: 0, unansweredQuestions: 0 }, t)).toEqual([]);
  });

  it('prvi sporni redak je nerazriješen prijenos', () => {
    const d = buildInitialDecisions(payload);
    expect(firstBlockingRowIndex(payload, d)).toBe(0);
  });

  it('nakon "Otišlo izvan mojih računa" (enabled:false) prijenos više ne koči i uvozi se po predznaku', () => {
    let d = buildInitialDecisions(payload);
    d = setTransferDecision(d, 0, { ...d.transfers[0]!, enabled: false, rememberRule: false });
    d = answerQuestion(d, 1, { choice: 'new' });
    const s = summarize(payload, d);
    expect(s.unresolvedTransfers).toBe(0);
    expect(s.plannedNew).toBe(2); // bankomat po predznaku + odgovoreno pitanje
    expect(s.canConfirm).toBe(true);
    expect(firstBlockingRowIndex(payload, d)).toBeNull();
    expect(buildBlockerMessages(s, t)).toEqual([]);
  });
});
