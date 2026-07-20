import { describe, it, expect } from 'vitest';
import { executeDecisions, planExecution, type ExecutorSupabaseClient } from '../executor';
import type { ImportReviewDecisions, ImportReviewPayload, SerializedImportedTx } from '../types';

function tx(i: number, over: Partial<SerializedImportedTx> = {}): SerializedImportedTx {
  return {
    index: i,
    dateIso: '2026-07-01T00:00:00.000Z',
    amount: 100,
    type: 'expense',
    category: 'Ostalo',
    description: 'desc',
    merchantName: 'BankMerchant',
    paymentSource: 'custom:src-1',
    balanceAfter: 500,
    fingerprint: `fp-${i}`,
    ...over,
  };
}

function payload(over: Partial<ImportReviewPayload> = {}): ImportReviewPayload {
  return {
    jobId: 'job-1',
    sourceId: 'src-1',
    sourceName: 'Revolut',
    createdAt: 0,
    batchId: 'batch-1',
    manualCandidates: {
      'm-with-name': { id: 'm-with-name', date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'ScannedName' } as any,
      'm-no-name':   { id: 'm-no-name',   date: '2026-07-01', amount: 100, type: 'expense', merchantName: null } as any,
    },
    rows: [],
    importedTransactions: [],
    ...over,
  };
}

// Fake supabase that records calls and returns configurable rowcounts.
function makeFakeClient(opts: {
  updateAffected?: (manualId: string) => number;
  insertedCount?: (rows: any[]) => number;
} = {}) {
  const calls: any[] = [];
  const client: ExecutorSupabaseClient = {
    from() {
      return {
        update(patch: any) {
          return {
            eq(_c: string, id: any) {
              return {
                eq() {
                  return {
                    is() {
                      return {
                        async select() {
                          calls.push({ op: 'update', id, patch });
                          const n = opts.updateAffected ? opts.updateAffected(id) : 1;
                          return { data: Array.from({ length: n }, () => ({ id })), error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        upsert(rows: any[]) {
          return {
            async select() {
              calls.push({ op: 'upsert', rows });
              const n = opts.insertedCount ? opts.insertedCount(rows) : rows.length;
              return { data: Array.from({ length: n }, (_, i) => ({ id: rows[i]?.bank_transaction_id })), error: null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const baseDecisions = (over: Partial<ImportReviewDecisions> = {}): ImportReviewDecisions => ({
  autoMerge: {}, questions: {}, newRows: {}, ...over,
});

describe('importReview/executor', () => {
  it('plan: skips fingerprint-locked rows, honors user checkboxes', () => {
    const p = payload({
      importedTransactions: [tx(0), tx(1), tx(2)],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'A', classification: { kind: 'new', existsByFingerprint: true } } as any,
        { index: 1, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'B', classification: { kind: 'new', existsByFingerprint: false } } as any,
        { index: 2, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'C', classification: { kind: 'new', existsByFingerprint: false } } as any,
      ],
    });
    const d = baseDecisions({ newRows: { 1: true, 2: false } });
    const plan = planExecution(p, d);
    expect(plan.inserts.map(i => i.rowIndex)).toEqual([1]);
    expect(plan.skippedFingerprint).toBe(1);
    expect(plan.skippedByUser).toBe(1);
  });

  it('MERGE: never touches amount/date/type; merchant policy manual-wins', async () => {
    const p = payload({
      importedTransactions: [tx(0, { merchantName: 'BankName' }), tx(1, { merchantName: 'BankName' })],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'BankName',
          classification: { kind: 'auto_merge', manualId: 'm-with-name', confidence: 'high', reason: 'merchant_match' } } as any,
        { index: 1, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'BankName',
          classification: { kind: 'auto_merge', manualId: 'm-no-name', confidence: 'high', reason: 'merchant_match' } } as any,
      ],
    });
    const d = baseDecisions({ autoMerge: { 0: true, 1: true } });
    const { client, calls } = makeFakeClient();
    const res = await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });

    expect(res.merged).toBe(2);
    expect(res.inserted).toBe(0);
    const updates = calls.filter(c => c.op === 'update');
    // Row 0: existing manual had merchantName → bank name NOT written.
    expect(updates[0].patch.merchant_name).toBeUndefined();
    // Row 1: existing manual had no merchant → bank name IS written.
    expect(updates[1].patch.merchant_name).toBe('BankName');
    // Never touches amount/date/type/category/payment_source on merge.
    for (const u of updates) {
      for (const k of ['amount', 'date', 'type', 'category', 'payment_source']) {
        expect(u.patch[k]).toBeUndefined();
      }
      expect(u.patch.bank_transaction_id).toMatch(/^fp-/);
      expect(u.patch.bank_match_status).toBe('confirmed');
      expect(u.patch.import_batch_id).toBe('batch-1');
    }
  });

  it('MERGE race-guard: 0 affected → skippedMerged (second-run idempotent)', async () => {
    const p = payload({
      importedTransactions: [tx(0)],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'x',
          classification: { kind: 'auto_merge', manualId: 'm-with-name', confidence: 'high', reason: 'merchant_match' } } as any,
      ],
    });
    const d = baseDecisions({ autoMerge: { 0: true } });
    const { client } = makeFakeClient({ updateAffected: () => 0 });
    const res = await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    expect(res.merged).toBe(0);
    expect(res.skippedMerged).toBe(1);
    expect(res.errors).toHaveLength(0);
  });

  it('NEW: idempotent re-run — 2nd time all skipped as duplicate', async () => {
    const p = payload({
      importedTransactions: [tx(0), tx(1)],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'A', classification: { kind: 'new', existsByFingerprint: false } } as any,
        { index: 1, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'B', classification: { kind: 'new', existsByFingerprint: false } } as any,
      ],
    });
    const d = baseDecisions({ newRows: { 0: true, 1: true } });
    const first = makeFakeClient(); // inserts all
    const r1 = await executeDecisions({ supabase: first.client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    expect(r1.inserted).toBe(2);
    expect(r1.skippedDuplicate).toBe(0);

    // Second run: ignoreDuplicates returns 0 rows.
    const second = makeFakeClient({ insertedCount: () => 0 });
    const r2 = await executeDecisions({ supabase: second.client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    expect(r2.inserted).toBe(0);
    expect(r2.skippedDuplicate).toBe(2);
    expect(r2.batchId).toBe('batch-1'); // same batchId across retries
  });

  it('question=new inserts; question=merge merges', async () => {
    const p = payload({
      importedTransactions: [tx(0), tx(1)],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'A',
          classification: { kind: 'question', reason: 'merchant_mismatch', candidates: ['m-with-name'] } } as any,
        { index: 1, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'B',
          classification: { kind: 'question', reason: 'merchant_mismatch', candidates: ['m-no-name'] } } as any,
      ],
    });
    const d = baseDecisions({ questions: { 0: { choice: 'merge', manualId: 'm-with-name' }, 1: { choice: 'new' } } });
    const { client, calls } = makeFakeClient();
    const res = await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    expect(res.merged).toBe(1);
    expect(res.inserted).toBe(1);
    expect(calls.some(c => c.op === 'update')).toBe(true);
    expect(calls.some(c => c.op === 'upsert')).toBe(true);
  });
});
