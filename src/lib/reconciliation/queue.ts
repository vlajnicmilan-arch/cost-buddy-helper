/**
 * Reconciliation queue — pub/sub store za post-import ReconciliationDialog.
 *
 * ImportReview.handleConfirm pušta jedan entry po sourceId s |delta| > 0.01.
 * ReconciliationDialogHost sluša queue i prikazuje jedan po jedan dijalog.
 *
 * Zatvaranje (X/back) NIJE odluka — entry ostaje reconciliation_state='pending'
 * (default u DB), banner iz TUR 2 nudi Nastavi/Odbaci.
 */
import type { ReconciliationSummaryEntry } from '@/lib/importReview/executor';

export interface ReconciliationQueueEntry {
  readonly summary: ReconciliationSummaryEntry;
  readonly sourceName: string;
  readonly sourceIcon?: string | null;
  readonly batchId: string;
  /** Timestamp (ISO) korišten za align_source_to_bank(as_of). */
  readonly asOfIso: string;
  /** imported_statements.id koji se ažurira. Ako je nedostupan, DB update se preskače. */
  readonly importedStatementId?: string | null;
}

type Listener = (head: ReconciliationQueueEntry | null) => void;

const queue: ReconciliationQueueEntry[] = [];
const listeners = new Set<Listener>();

function notify() {
  const head = queue[0] ?? null;
  for (const l of listeners) {
    try { l(head); } catch { /* noop */ }
  }
}

export function subscribeReconciliation(listener: Listener): () => void {
  listeners.add(listener);
  // initial push
  try { listener(queue[0] ?? null); } catch { /* noop */ }
  return () => { listeners.delete(listener); };
}

export function enqueueReconciliation(entries: readonly ReconciliationQueueEntry[]): void {
  if (entries.length === 0) return;
  queue.push(...entries);
  notify();
}

export function dequeueReconciliation(sourceId?: string): void {
  if (queue.length === 0) return;
  if (sourceId && queue[0]?.summary.sourceId !== sourceId) return;
  queue.shift();
  notify();
}

export function clearReconciliationQueue(): void {
  if (queue.length === 0) return;
  queue.length = 0;
  notify();
}

export function _peekQueue(): readonly ReconciliationQueueEntry[] {
  return [...queue];
}
