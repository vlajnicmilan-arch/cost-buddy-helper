/**
 * Reconciliation queue — FIFO, subscribers dobiju head na svaku promjenu.
 */
import { describe, it, expect } from 'vitest';
import {
  enqueueReconciliation,
  dequeueReconciliation,
  subscribeReconciliation,
  clearReconciliationQueue,
  _peekQueue,
  type ReconciliationQueueEntry,
} from '@/lib/reconciliation/queue';
import type { ReconciliationSummaryEntry } from '@/lib/importReview/executor';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function mkEntry(id: string): ReconciliationQueueEntry {
  const s: ReconciliationSummaryEntry = {
    sourceId: id, appBalance: 1, bankBalance: 2, delta: 1,
    hasBankRow: true, needsReconciliation: true, engineMode: 'hybrid',
  };
  return { summary: s, sourceName: id.slice(0,4), batchId: 'batch', asOfIso: new Date().toISOString(), importedStatementId: null };
}

describe('reconciliation/queue', () => {
  it('FIFO order — dequeue vraća prvi entry', () => {
    clearReconciliationQueue();
    enqueueReconciliation([mkEntry(A), mkEntry(B)]);
    expect(_peekQueue().map(e => e.summary.sourceId)).toEqual([A, B]);
    dequeueReconciliation(A);
    expect(_peekQueue().map(e => e.summary.sourceId)).toEqual([B]);
    dequeueReconciliation(B);
    expect(_peekQueue()).toEqual([]);
  });

  it('subscriber prima head odmah i na promjene', () => {
    clearReconciliationQueue();
    const events: (string | null)[] = [];
    const unsub = subscribeReconciliation(e => events.push(e?.summary.sourceId ?? null));
    enqueueReconciliation([mkEntry(A)]);
    dequeueReconciliation(A);
    unsub();
    expect(events).toEqual([null, A, null]);
  });

  it('dequeue s krivim sourceId ne skida head (idempotentnost)', () => {
    clearReconciliationQueue();
    enqueueReconciliation([mkEntry(A)]);
    dequeueReconciliation(B);
    expect(_peekQueue()).toHaveLength(1);
  });
});
