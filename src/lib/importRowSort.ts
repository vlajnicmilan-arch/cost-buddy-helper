/**
 * Import row ordering — deterministic sort for a list rendered "newest first"
 * that must keep bank-imported rows in the original bank order within the same
 * day and the same import batch.
 *
 * Why this exists: bank statements give us only the calendar day (no time).
 * Two rows on the same day therefore have equal `date.getTime()` and any
 * downstream sort by (date desc) alone tie-breaks arbitrarily → the per-row
 * "S: <balance>" chain looked like it jumps up and down for the user.
 *
 * Ordering key: (date desc, bank_row_seq asc within same import_batch_id,
 * NULLS LAST, created_at desc).
 *
 *   - date desc                 → newest day at top (matches app-wide list convention)
 *   - same date, same batch,    → bank_row_seq ASC. Revolut / Aircash / KEKS
 *     both seqs present            statements list newest first (seq 0 = top of
 *                                  statement). ASC keeps that same order in
 *                                  our list.
 *   - same date, only one seq  → the non-null (bank) row wins over the
 *                                  seq-less (manual/legacy) row (NULLS LAST).
 *   - same date, no seq at all → fall back to created_at desc so the recently
 *                                  added row is on top.
 *
 * Pure and framework-free. Extracted so a single vitest can pin the behavior.
 */

export interface SortableRow {
  readonly date: Date | string | number;
  readonly bank_row_seq?: number | null;
  readonly import_batch_id?: string | null;
  readonly created_at?: string | null;
}

const dayMs = (d: SortableRow['date']): number => {
  if (d instanceof Date) return d.getTime();
  if (typeof d === 'number') return d;
  return new Date(d).getTime();
};

export function compareImportRowsDesc<T extends SortableRow>(a: T, b: T): number {
  const da = dayMs(a.date);
  const db = dayMs(b.date);
  if (da !== db) return db - da;

  const sa = typeof a.bank_row_seq === 'number' ? a.bank_row_seq : null;
  const sb = typeof b.bank_row_seq === 'number' ? b.bank_row_seq : null;

  // Both bank rows, same batch → preserve bank order (ASC = statement order).
  if (sa !== null && sb !== null && a.import_batch_id && a.import_batch_id === b.import_batch_id) {
    return sa - sb;
  }

  // Non-null seq beats null seq (NULLS LAST).
  if (sa !== null && sb === null) return -1;
  if (sa === null && sb !== null) return 1;

  const ca = a.created_at ?? '';
  const cb = b.created_at ?? '';
  if (ca === cb) return 0;
  return ca < cb ? 1 : -1;
}
