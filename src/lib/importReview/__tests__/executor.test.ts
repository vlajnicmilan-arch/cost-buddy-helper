import { describe, it, expect } from 'vitest';
import {
  executeDecisions,
  ImportExecutionIncompleteError,
  planExecution,
  type ExecutorSupabaseClient,
} from '../executor';
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
    bankRowSeq: i,
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
    batchId: 'batch-1', availableTargets: [],
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
  autoMerge: {}, questions: {}, newRows: {}, transfers: {}, ...over,
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

  it('MERGE race-guard: 0 affected → glasna nepotpuna izvedba', async () => {
    const p = payload({
      importedTransactions: [tx(0)],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'x',
          classification: { kind: 'auto_merge', manualId: 'm-with-name', confidence: 'high', reason: 'merchant_match' } } as any,
      ],
    });
    const d = baseDecisions({ autoMerge: { 0: true } });
    const { client } = makeFakeClient({ updateAffected: () => 0 });
    await expect(executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d }))
      .rejects.toMatchObject({ expectedOutcomes: 1, actualOutcomes: 0 });
  });

  it('NEW: konflikt ne smije biti lažni uspjeh', async () => {
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
    await expect(executeDecisions({ supabase: second.client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d }))
      .rejects.toBeInstanceOf(ImportExecutionIncompleteError);
  });

  it('question=new inserts; question=merge merges', async () => {
    const p = payload({
      importedTransactions: [tx(0), tx(1)],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'A',
          classification: { kind: 'question', reason: 'merchant_mismatch', candidateIds: ['m-with-name'] } } as any,
        { index: 1, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'B',
          classification: { kind: 'question', reason: 'merchant_mismatch', candidateIds: ['m-no-name'] } } as any,
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

  it('PRE-FLIGHT: transfer without target aborts entire batch (no writes)', async () => {
    const p = payload({
      importedTransactions: [tx(0, { type: 'transfer' }), tx(1)],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'transfer', merchantName: 'Aircash',
          classification: { kind: 'transfer', targetIncomeSourceId: '', ruleId: null } } as any,
        { index: 1, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'B',
          classification: { kind: 'new', existsByFingerprint: false } } as any,
      ],
    });
    const d = baseDecisions({
      transfers: { 0: { enabled: true, direction: 'out' as const, targetIncomeSourceId: '', rememberRule: false, merchantKey: null, sourceWalletKey: null } },
      newRows: { 1: true },
    });
    const { client, calls } = makeFakeClient();
    await expect(executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d }))
      .rejects.toMatchObject({ executionErrors: ['transfer:0:missing_target'] });
    // Absolutely no writes were issued.
    expect(calls).toHaveLength(0);
  });

  it('INSERT writes balance_after + bank_row_seq from tx onto the row', async () => {
    const p = payload({
      importedTransactions: [tx(0, { balanceAfter: 4038.10, bankRowSeq: 0 }), tx(1, { balanceAfter: 3900.00, bankRowSeq: 1 })],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'A', classification: { kind: 'new', existsByFingerprint: false } } as any,
        { index: 1, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'B', classification: { kind: 'new', existsByFingerprint: false } } as any,
      ],
    });
    const d = baseDecisions({ newRows: { 0: true, 1: true } });
    const { client, calls } = makeFakeClient();
    await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    const upsert = calls.find(c => c.op === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert.rows[0].balance_after).toBe(4038.10);
    expect(upsert.rows[0].bank_row_seq).toBe(0);
    expect(upsert.rows[1].balance_after).toBe(3900.00);
    expect(upsert.rows[1].bank_row_seq).toBe(1);
  });

  it('TRANSFER writes balance_after + bank_row_seq (bank timeline preserved)', async () => {
    const p = payload({
      importedTransactions: [tx(0, { type: 'transfer', balanceAfter: 100, bankRowSeq: 3 })],
      rows: [
        { index: 0, date: '2026-07-01', amount: 100, type: 'transfer', merchantName: 'Aircash',
          classification: { kind: 'transfer', targetIncomeSourceId: 'wallet-a', ruleId: null } } as any,
      ],
    });
    const d = baseDecisions({
      transfers: { 0: { enabled: true, direction: 'out' as const, targetIncomeSourceId: 'wallet-a', rememberRule: false, merchantKey: null, sourceWalletKey: null } },
    });
    const { client, calls } = makeFakeClient();
    await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    const upsert = calls.find(c => c.op === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert.rows[0].balance_after).toBe(100);
    expect(upsert.rows[0].bank_row_seq).toBe(3);
    expect(upsert.rows[0].type).toBe('transfer');
  });

  it('2 popunjena prijenosa proizvode točno 2 ishoda', async () => {
    const p = payload({
      importedTransactions: [tx(0, { type: 'transfer' }), tx(1, { type: 'transfer' })],
      rows: [0, 1].map(index => ({
        index, date: '2026-07-01', amount: 100, type: 'transfer', merchantName: 'Aircash',
        classification: { kind: 'transfer', targetIncomeSourceId: '', ruleId: null },
      })) as any,
    });
    const decision = (targetIncomeSourceId: string) => ({
      enabled: true, direction: 'out' as const, targetIncomeSourceId,
      rememberRule: false, merchantKey: null, sourceWalletKey: null,
    });
    const d = baseDecisions({ transfers: { 0: decision('wallet-a'), 1: decision('wallet-b') } });
    const { client } = makeFakeClient();
    const result = await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    expect(result.transfersCreated).toBe(2);
    expect(result.inserted + result.merged + result.transfersCreated).toBe(2);
  });

  it('pad jednog od 2 transfer ishoda baca glasnu grešku', async () => {
    const p = payload({
      importedTransactions: [tx(0, { type: 'transfer' }), tx(1, { type: 'transfer' })],
      rows: [0, 1].map(index => ({
        index, date: '2026-07-01', amount: 100, type: 'transfer', merchantName: 'Aircash',
        classification: { kind: 'transfer', targetIncomeSourceId: '', ruleId: null },
      })) as any,
    });
    const decision = (targetIncomeSourceId: string) => ({
      enabled: true, direction: 'out' as const, targetIncomeSourceId,
      rememberRule: false, merchantKey: null, sourceWalletKey: null,
    });
    const d = baseDecisions({ transfers: { 0: decision('wallet-a'), 1: decision('wallet-b') } });
    const { client } = makeFakeClient({ insertedCount: () => 1 });
    await expect(executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d }))
      .rejects.toMatchObject({ expectedOutcomes: 2, actualOutcomes: 1 });
  });
});
