/**
 * SIDRO SALDA IZ SAMOG IZVODA — izvor bez bankovnog retka (nema Open Bankinga).
 *
 * Doslovan slučaj korisnika (Erste izvod Akrobata br. 026):
 *   app nakon uvoza 34,93 · closing na izvodu 244,85 → korekcija +209,92.
 *
 * Regresije koje se čuvaju:
 *   - has_bank_row = true → ponašanje NEPROMIJENJENO (bankovni redak ima prednost)
 *   - nema closing balance i nema bank row → ništa (kao danas)
 */
import { describe, it, expect } from 'vitest';
import {
  executeDecisions,
  resolveStatementFallback,
  toStatementIso,
  type ExecutorSupabaseClient,
} from '@/lib/importReview/executor';
import type { ImportReviewPayload, ImportReviewDecisions } from '@/lib/importReview/types';

const SOURCE = '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8';

function mkPayload(over: Partial<ImportReviewPayload> = {}): ImportReviewPayload {
  return {
    jobId: 'job-1',
    sourceId: SOURCE,
    sourceName: 'Biznis Akrobat',
    createdAt: 0,
    rows: [
      { index: 0, classification: { kind: 'new', existsByFingerprint: false } } as never,
    ],
    manualCandidates: {},
    importedTransactions: [
      {
        index: 0,
        dateIso: '2026-07-31T00:00:00.000Z',
        amount: 217.09,
        type: 'expense',
        category: 'other',
        description: 'Promet',
        merchantName: null,
        paymentSource: `custom:${SOURCE}`,
        balanceAfter: null,
        bankRowSeq: 0,
        fingerprint: 'fp-0',
      } as never,
    ],
    batchId: 'batch-1',
    availableTargets: [],
    ...over,
  } as ImportReviewPayload;
}

const decisions: ImportReviewDecisions = {
  autoMerge: {},
  questions: {},
  newRows: { 0: true },
  transfers: {},
} as ImportReviewDecisions;

function mkSupabase(rpcResult: Record<string, unknown>): ExecutorSupabaseClient {
  const persisted = new Set<string>();
  const chain: any = {
    upsert: (rows: any[]) => {
      rows.forEach(row => persisted.add(row.bank_transaction_id));
      return chain;
    },
    update: () => chain,
    eq: () => chain,
    is: () => chain,
    select: (columns?: string) => {
      if (columns === 'bank_transaction_id,status') {
        return {
          eq: () => ({
            in: async (_column: string, fingerprints: string[]) => ({
              data: fingerprints.filter(fp => persisted.has(fp)).map(bank_transaction_id => ({ bank_transaction_id, status: null })),
              error: null,
            }),
          }),
        };
      }
      return Promise.resolve({ data: [{ id: 'x' }], error: null });
    },
  };
  return {
    from: () => chain,
    rpc: async () => ({ data: rpcResult, error: null }),
  } as unknown as ExecutorSupabaseClient;
}

describe('saldo s izvoda kao bankovna istina', () => {
  it('bez bankovnog retka koristi closing balance izvoda (34,93 → 244,85 = +209,92)', async () => {
    const res = await executeDecisions({
      supabase: mkSupabase({ app_balance: 34.93, bank_balance: null, delta: null, has_bank_row: false }),
      userId: 'u1',
      activeBusinessProfileId: null,
      payload: mkPayload({ statementClosingBalance: 244.85, statementDate: '2026-07-31' }),
      decisions,
    });
    const entry = res.reconciliationSummary[0];
    expect(entry.sourceId).toBe(SOURCE);
    expect(entry.appBalance).toBe(34.93);
    expect(entry.bankBalance).toBe(244.85);
    expect(entry.delta).toBe(209.92);
    expect(entry.needsReconciliation).toBe(true);
    expect(entry.bankSource).toBe('statement');
    // Sidro ide na kraj dana izvoda, ne na trenutak klika.
    expect(entry.batchLastAt).toBe('2026-07-31T23:59:59.000Z');
  });

  it('bankovni redak ima prednost — ponašanje nepromijenjeno', async () => {
    const res = await executeDecisions({
      supabase: mkSupabase({
        app_balance: 34.93,
        bank_balance: 100,
        delta: 65.07,
        has_bank_row: true,
        batch_last_at: '2026-07-31T10:00:00.000Z',
      }),
      userId: 'u1',
      activeBusinessProfileId: null,
      payload: mkPayload({ statementClosingBalance: 244.85, statementDate: '2026-07-31' }),
      decisions,
    });
    const entry = res.reconciliationSummary[0];
    expect(entry.hasBankRow).toBe(true);
    expect(entry.bankBalance).toBe(100);
    expect(entry.delta).toBe(65.07);
    expect(entry.bankSource).toBe('bank_row');
  });

  it('bez closing balance i bez bankovnog retka → ne traži ništa', async () => {
    const res = await executeDecisions({
      supabase: mkSupabase({ app_balance: 34.93, bank_balance: null, delta: null, has_bank_row: false }),
      userId: 'u1',
      activeBusinessProfileId: null,
      payload: mkPayload(),
      decisions,
    });
    const entry = res.reconciliationSummary[0];
    expect(entry.needsReconciliation).toBe(false);
    expect(entry.bankBalance).toBeNull();
    expect(entry.bankSource).toBe('bank_row');
  });

  it('razlika ispod centa ne traži odluku', async () => {
    const res = await executeDecisions({
      supabase: mkSupabase({ app_balance: 244.85, bank_balance: null, delta: null, has_bank_row: false }),
      userId: 'u1',
      activeBusinessProfileId: null,
      payload: mkPayload({ statementClosingBalance: 244.85, statementDate: '2026-07-31' }),
      decisions,
    });
    expect(res.reconciliationSummary[0].needsReconciliation).toBe(false);
  });

  it('povijesni izvod (završava prije sidra) ne traži odluku', async () => {
    const res = await executeDecisions({
      supabase: mkSupabase({
        app_balance: 34.93,
        bank_balance: null,
        delta: null,
        has_bank_row: false,
        anchor_date: '2026-08-05T00:00:00.000Z',
      }),
      userId: 'u1',
      activeBusinessProfileId: null,
      payload: mkPayload({ statementClosingBalance: 244.85, statementDate: '2026-07-31' }),
      decisions,
    });
    const entry = res.reconciliationSummary[0];
    expect(entry.isHistorical).toBe(true);
    expect(entry.needsReconciliation).toBe(false);
  });
});

describe('pomoćnici', () => {
  it('resolveStatementFallback vraća null bez broja', () => {
    expect(resolveStatementFallback(mkPayload())).toBeNull();
    expect(resolveStatementFallback(mkPayload({ statementClosingBalance: 244.85 }))?.closingBalance).toBe(244.85);
  });

  it('toStatementIso pretvara datum u kraj dana, ISO ostaje', () => {
    expect(toStatementIso('2026-07-31')).toBe('2026-07-31T23:59:59.000Z');
    expect(toStatementIso('2026-07-31T10:00:00.000Z')).toBe('2026-07-31T10:00:00.000Z');
    expect(toStatementIso(null)).toBeNull();
  });
});
