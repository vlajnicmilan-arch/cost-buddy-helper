import { describe, it, expect } from 'vitest';
import { compareImportRowsDesc } from '../importRowSort';

const d = (iso: string) => new Date(iso);

describe('compareImportRowsDesc', () => {
  it('sorts different days newest first', () => {
    const rows = [
      { date: d('2026-07-10'), created_at: '2026-07-10T10:00:00Z' },
      { date: d('2026-07-12'), created_at: '2026-07-12T10:00:00Z' },
      { date: d('2026-07-11'), created_at: '2026-07-11T10:00:00Z' },
    ];
    const sorted = [...rows].sort(compareImportRowsDesc);
    expect(sorted.map(r => (r.date as Date).toISOString().slice(0, 10)))
      .toEqual(['2026-07-12', '2026-07-11', '2026-07-10']);
  });

  it('same day + same batch: bank_row_seq ASC (statement order)', () => {
    const rows = [
      { date: d('2026-07-10'), import_batch_id: 'b1', bank_row_seq: 2 },
      { date: d('2026-07-10'), import_batch_id: 'b1', bank_row_seq: 0 },
      { date: d('2026-07-10'), import_batch_id: 'b1', bank_row_seq: 1 },
    ];
    const sorted = [...rows].sort(compareImportRowsDesc);
    expect(sorted.map(r => r.bank_row_seq)).toEqual([0, 1, 2]);
  });

  it('same day: non-null seq wins over null seq (NULLS LAST)', () => {
    const rows = [
      { date: d('2026-07-10'), created_at: '2026-07-10T15:00:00Z' },
      { date: d('2026-07-10'), import_batch_id: 'b1', bank_row_seq: 3, created_at: '2026-07-10T09:00:00Z' },
    ];
    const sorted = [...rows].sort(compareImportRowsDesc);
    expect(sorted[0].bank_row_seq).toBe(3);
    expect(sorted[1].bank_row_seq).toBeUndefined();
  });

  it('same day, both null seq: created_at desc', () => {
    const rows = [
      { date: d('2026-07-10'), created_at: '2026-07-10T09:00:00Z' },
      { date: d('2026-07-10'), created_at: '2026-07-10T18:00:00Z' },
    ];
    const sorted = [...rows].sort(compareImportRowsDesc);
    expect(sorted[0].created_at).toBe('2026-07-10T18:00:00Z');
  });

  it('different batches on same day: does NOT compare seqs across batches', () => {
    const rows = [
      { date: d('2026-07-10'), import_batch_id: 'b1', bank_row_seq: 5, created_at: '2026-07-10T08:00:00Z' },
      { date: d('2026-07-10'), import_batch_id: 'b2', bank_row_seq: 0, created_at: '2026-07-10T20:00:00Z' },
    ];
    const sorted = [...rows].sort(compareImportRowsDesc);
    // Neither is NULL → falls to created_at desc, b2 (20:00) wins.
    expect(sorted[0].import_batch_id).toBe('b2');
  });
});
