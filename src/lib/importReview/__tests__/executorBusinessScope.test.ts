import { describe, it, expect } from 'vitest';
import { executeDecisions, type ExecutorSupabaseClient } from '../executor';
import type { ImportReviewDecisions, ImportReviewPayload, SerializedImportedTx } from '../types';

const BIZ = 'bp-akrobat';
const BIZ_SOURCE = 'src-biz';

function tx(i: number, over: Partial<SerializedImportedTx> = {}): SerializedImportedTx {
  return {
    index: i,
    dateIso: '2026-07-01T00:00:00.000Z',
    amount: 100,
    type: 'expense',
    category: 'Ostalo',
    description: 'desc',
    merchantName: 'Bank',
    paymentSource: `custom:${BIZ_SOURCE}`,
    balanceAfter: 500,
    bankRowSeq: i,
    fingerprint: `fp-${i}`,
    ...over,
  };
}

function makeClient() {
  const upserted: any[] = [];
  const persisted = new Set<string>();
  const client: ExecutorSupabaseClient = {
    from(table: string) {
      if (table === 'custom_payment_sources') {
        return {
          select() {
            return {
              async in(_c: string, ids: string[]) {
                return {
                  data: ids.map(id => ({ id, business_profile_id: id === BIZ_SOURCE ? BIZ : null })),
                  error: null,
                };
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            eq() {
              return { async in() { return { data: [], error: null }; } };
            },
          };
        },
        upsert(rows: any[]) {
          return {
            async select() {
              upserted.push(...rows);
              return { data: rows.map(r => ({ id: r.bank_transaction_id })), error: null };
            },
          };
        },
      };
    },
  };
  return { client, upserted };
}

const decisions = (over: Partial<ImportReviewDecisions> = {}): ImportReviewDecisions => ({
  autoMerge: {}, questions: {}, newRows: {}, transfers: {}, ...over,
});

describe('executor — pripadnost tvrtki ide po novčaniku', () => {
  const payload = (t: SerializedImportedTx): ImportReviewPayload => ({
    jobId: 'job-1',
    sourceId: BIZ_SOURCE,
    sourceName: 'Biznis Akrobat',
    createdAt: 0,
    batchId: 'batch-1',
    availableTargets: [],
    manualCandidates: {},
    rows: [
      { index: 0, date: '2026-07-01', amount: 100, type: 'expense', merchantName: 'Bank',
        classification: { kind: 'new', existsByFingerprint: false } } as any,
    ],
    importedTransactions: [t],
  });

  it('firmin novčanik → redak dobiva oznaku tvrtke iako je aktivan osobni pogled', async () => {
    const { client, upserted } = makeClient();
    await executeDecisions({
      supabase: client,
      userId: 'u1',
      activeBusinessProfileId: null,
      payload: payload(tx(0)),
      decisions: decisions({ newRows: { 0: true } }),
    });
    expect(upserted).toHaveLength(1);
    expect(upserted[0].business_profile_id).toBe(BIZ);
  });

  it('osobni novčanik → bez oznake tvrtke iako je aktivan poslovni pogled', async () => {
    const { client, upserted } = makeClient();
    await executeDecisions({
      supabase: client,
      userId: 'u1',
      activeBusinessProfileId: BIZ,
      payload: payload(tx(0, { paymentSource: 'custom:src-personal' })),
      decisions: decisions({ newRows: { 0: true } }),
    });
    expect(upserted).toHaveLength(1);
    expect(upserted[0].business_profile_id).toBeNull();
  });
});
