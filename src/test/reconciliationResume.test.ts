/**
 * TUR 2 — Reconciliation resume banner logic.
 *
 * Cilj:
 *  1. reconstructResumableFromMeta izostavlja odlučene sourceove.
 *  2. writePendingSnapshot je read-modify-write bez gubljenja meta.sources.
 *  3. fetchResumableReconciliations vraća sve statement-e u 'pending'.
 *  4. countPendingSources zbraja preostale entrye.
 */
import { describe, it, expect } from 'vitest';
import {
  reconstructResumableFromMeta,
  writePendingSnapshot,
  fetchResumableReconciliations,
  countPendingSources,
  type ReconciliationPendingSnapshot,
} from '@/lib/reconciliation/resume';
import type { ReconciliationSupabaseClient } from '@/lib/reconciliation/actions';

const snapshot = (over: Partial<ReconciliationPendingSnapshot> = {}): ReconciliationPendingSnapshot => ({
  batchId: 'batch-1',
  asOfIso: '2026-07-22T10:00:00.000Z',
  entries: [
    {
      summary: {
        sourceId: 'src-A',
        appBalance: 100,
        bankBalance: 120,
        delta: 20,
        hasBankRow: true,
        needsReconciliation: true,
        engineMode: 'hybrid',
      },
      sourceName: 'Revolut',
      sourceIcon: '💳',
    },
    {
      summary: {
        sourceId: 'src-B',
        appBalance: 200,
        bankBalance: 210,
        delta: 10,
        hasBankRow: true,
        needsReconciliation: true,
        engineMode: 'hybrid',
      },
      sourceName: 'Aircash',
      sourceIcon: null,
    },
  ],
  ...over,
});

describe('reconstructResumableFromMeta', () => {
  it('vraća sve entrye kada meta.sources je prazan', () => {
    const rec = reconstructResumableFromMeta('stmt-1', { pending: snapshot() });
    expect(rec).not.toBeNull();
    expect(rec!.entries).toHaveLength(2);
    expect(rec!.entries[0].importedStatementId).toBe('stmt-1');
    expect(rec!.entries[0].batchId).toBe('batch-1');
  });

  it('izostavlja odlučene sourceove (aligned/user_override)', () => {
    const rec = reconstructResumableFromMeta('stmt-1', {
      pending: snapshot(),
      sources: { 'src-A': 'aligned' },
    });
    expect(rec!.entries).toHaveLength(1);
    expect(rec!.entries[0].summary.sourceId).toBe('src-B');
  });

  it('vraća null kada su svi odlučeni', () => {
    const rec = reconstructResumableFromMeta('stmt-1', {
      pending: snapshot(),
      sources: { 'src-A': 'aligned', 'src-B': 'user_override' },
    });
    expect(rec).toBeNull();
  });

  it('vraća null kada pending snapshot ne postoji', () => {
    expect(reconstructResumableFromMeta('stmt-1', null)).toBeNull();
    expect(reconstructResumableFromMeta('stmt-1', {})).toBeNull();
  });
});

describe('countPendingSources', () => {
  it('zbraja entrye po statementima', () => {
    const rec = reconstructResumableFromMeta('stmt-1', { pending: snapshot() });
    expect(countPendingSources([rec!, rec!])).toBe(4);
  });

  it('vraća 0 za praznu listu', () => {
    expect(countPendingSources([])).toBe(0);
  });
});

/** Minimalni supabase mock za I/O testove (read-modify-write). */
function mkSupabase(row: { id: string; reconciliation_meta: Record<string, unknown> | null }): {
  supabase: ReconciliationSupabaseClient;
  updates: Array<Record<string, unknown>>;
} {
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    async rpc() { return { data: null, error: null }; },
    from(_table: string) {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: unknown) => ({
            maybeSingle: async () => ({ data: { reconciliation_meta: row.reconciliation_meta }, error: null }),
          }),
          // fetchResumableReconciliations path: .from(x).select().eq('reconciliation_state','pending')
          async then(res: any) { res({ data: [row], error: null }); },
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, _val: unknown) => {
            updates.push(patch);
            row.reconciliation_meta = (patch.reconciliation_meta as any) ?? row.reconciliation_meta;
            return { data: null, error: null };
          },
        }),
      };
    },
  } as unknown as ReconciliationSupabaseClient;
  return { supabase, updates };
}

describe('writePendingSnapshot', () => {
  it('read-modify-write čuva postojeći meta.sources', async () => {
    const row = { id: 'stmt-1', reconciliation_meta: { sources: { 'src-Z': 'aligned' as const } } };
    const { supabase, updates } = mkSupabase(row);
    await writePendingSnapshot(supabase, 'stmt-1', snapshot());
    expect(updates).toHaveLength(1);
    const meta = updates[0].reconciliation_meta as any;
    expect(meta.sources).toEqual({ 'src-Z': 'aligned' });
    expect(meta.pending.batchId).toBe('batch-1');
    expect(meta.pending.entries).toHaveLength(2);
    expect(updates[0].reconciliation_state).toBe('pending');
  });
});

describe('fetchResumableReconciliations', () => {
  it('vraća samo statement-e s preostalim pending entryjima', async () => {
    // Ovaj test koristi direktan mock nad .from(...).select(...).eq(...) chainom,
    // pa ga radimo bez maybeSingle grane.
    const rows = [
      { id: 'stmt-1', reconciliation_meta: { pending: snapshot() } },
      { id: 'stmt-2', reconciliation_meta: { pending: snapshot(), sources: { 'src-A': 'aligned', 'src-B': 'user_override' } } },
    ];
    const supabase = {
      async rpc() { return { data: null, error: null }; },
      from(_t: string) {
        return {
          select: (_c: string) => ({
            eq: (_col: string, _val: string) => Promise.resolve({ data: rows, error: null }),
          }),
        };
      },
    } as unknown as ReconciliationSupabaseClient;
    const res = await fetchResumableReconciliations(supabase);
    expect(res).toHaveLength(1);
    expect(res[0].statementId).toBe('stmt-1');
    expect(res[0].entries).toHaveLength(2);
  });
});
