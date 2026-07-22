/**
 * TUR 1 — ReconciliationDialog state machine + align RPC contract.
 *
 * Cilj:
 *  1. 3 akcije → 3 stanja (aligned / user_override / pending).
 *  2. Align poziva RPC točno jednom po pozivu s ispravnim argumentima.
 *  3. Zatvaranje bez akcije NE piše u imported_statements.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  aggregateOverall,
  alignToBank,
  keepMine,
  type ReconciliationSupabaseClient,
} from '@/lib/reconciliation/actions';
import type { ReconciliationSummaryEntry } from '@/lib/importReview/executor';

function summary(over: Partial<ReconciliationSummaryEntry> = {}): ReconciliationSummaryEntry {
  return {
    sourceId: '11111111-1111-1111-1111-111111111111',
    appBalance: 100,
    bankBalance: 120,
    delta: 20,
    hasBankRow: true,
    needsReconciliation: true,
    engineMode: 'hybrid',
    ...over,
  };
}

function mkSupabase(): {
  supabase: ReconciliationSupabaseClient;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown>; id: string }>;
  metaStore: Record<string, unknown>;
} {
  const rpcCalls: any[] = [];
  const updates: any[] = [];
  const metaStore: Record<string, unknown> = {};

  const supabase: ReconciliationSupabaseClient = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === 'align_source_to_bank') {
        return { data: { new_anchor_balance: args.p_bank_balance, idempotent_skip: false }, error: null };
      }
      return { data: null, error: null };
    }) as any,
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({ data: { reconciliation_meta: metaStore, reconciliation_state: null }, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ table, patch, id });
          Object.assign(metaStore, (patch.reconciliation_meta as any) ?? {});
          return { data: null, error: null };
        },
      }),
    }),
  };

  return { supabase, rpcCalls, updates, metaStore };
}

describe('reconciliation/actions — TUR 1', () => {
  it('alignToBank poziva align_source_to_bank RPC točno jednom + patcha statement na aligned', async () => {
    const { supabase, rpcCalls, updates } = mkSupabase();
    const res = await alignToBank({
      supabase,
      summary: summary(),
      asOfIso: '2026-07-22T18:00:00Z',
      importedStatementId: 'stmt-1',
    });
    expect(res.newBalance).toBe(120);
    const alignCalls = rpcCalls.filter(c => c.fn === 'align_source_to_bank');
    expect(alignCalls).toHaveLength(1);
    expect(alignCalls[0].args).toMatchObject({
      p_source_id: '11111111-1111-1111-1111-111111111111',
      p_bank_balance: 120,
      p_as_of: '2026-07-22T18:00:00Z',
    });
    const alignedUpdate = updates.find(u => (u.patch as any).reconciliation_state === 'aligned');
    expect(alignedUpdate).toBeTruthy();
  });

  it('keepMine ne poziva RPC i piše user_override', async () => {
    const { supabase, rpcCalls, updates } = mkSupabase();
    await keepMine({ supabase, summary: summary(), importedStatementId: 'stmt-1' });
    expect(rpcCalls).toHaveLength(0);
    expect(updates.find(u => (u.patch as any).reconciliation_state === 'user_override')).toBeTruthy();
  });

  it('keepMine bez statement id → nema zapisa (state ostaje pending)', async () => {
    const { supabase, rpcCalls, updates } = mkSupabase();
    await keepMine({ supabase, summary: summary(), importedStatementId: null });
    expect(rpcCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('alignToBank baca ako je bankBalance null (nema što poravnati)', async () => {
    const { supabase } = mkSupabase();
    await expect(alignToBank({
      supabase,
      summary: summary({ bankBalance: null }),
      asOfIso: '2026-07-22T18:00:00Z',
      importedStatementId: 'stmt-1',
    })).rejects.toThrow(/bankBalance/);
  });

  it('aggregateOverall — matrica', () => {
    expect(aggregateOverall({})).toBe('pending');
    expect(aggregateOverall({ a: 'aligned' })).toBe('aligned');
    expect(aggregateOverall({ a: 'aligned', b: 'aligned' })).toBe('aligned');
    expect(aggregateOverall({ a: 'aligned', b: 'user_override' })).toBe('user_override');
    expect(aggregateOverall({ a: 'aligned', b: 'pending' })).toBe('pending');
    expect(aggregateOverall({ a: 'user_override', b: 'user_override' })).toBe('user_override');
  });
});
