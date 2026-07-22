/**
 * ImportUndo host — pub/sub store za globalno otvaranje ImportBatchDialog-a
 * (undo import batch) iz mjesta koja nemaju direktan pristup Expense listi.
 *
 * Callers:
 *  - ImportReview toast action (nakon uspješnog uvoza).
 *  - ReconciliationDialogHost secondary link.
 *  - ReconciliationResumeBanner secondary link.
 *
 * ImportBatchDialogHost sluša i dohvaća expenses po batchId prije nego
 * renderira postojeći ImportBatchDialog.
 */

export interface OpenImportBatchRequest {
  readonly batchId: string;
  /** Optional callback nakon uspješnog undo-a (dequeue reconciliation itd.). */
  readonly onUndone?: () => void | Promise<void>;
}

type Listener = (req: OpenImportBatchRequest | null) => void;

let current: OpenImportBatchRequest | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) {
    try { l(current); } catch { /* noop */ }
  }
}

export function subscribeImportUndo(listener: Listener): () => void {
  listeners.add(listener);
  try { listener(current); } catch { /* noop */ }
  return () => { listeners.delete(listener); };
}

export function openImportBatch(batchId: string, onUndone?: () => void | Promise<void>): void {
  if (!batchId) return;
  current = { batchId, onUndone };
  notify();
}

export function closeImportBatch(): void {
  if (current === null) return;
  current = null;
  notify();
}

/** Test-only helper. */
export function _peekImportUndo(): OpenImportBatchRequest | null {
  return current;
}
