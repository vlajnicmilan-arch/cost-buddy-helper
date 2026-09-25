/**
 * Živa salda — nalog 4: Krug ledger + transactions on the same live channel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  registerWalletsRefresher,
  registerLiveRefresher,
  markLiveDirty,
  __resetWalletsRefreshersForTests,
} from '@/lib/liveData/walletsRefreshBus';

interface Binding { filter: { table: string }; h: (p: unknown) => void }
interface FakeChannel { name: string; bindings: Binding[]; removed: boolean; subCb: ((s: string) => void) | null }

const rt = vi.hoisted(() => ({
  channels: [] as unknown[],
  userId: 'u1' as string | null,
  fromTables: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => Promise.resolve({ data: [], error: null });
  return {
    supabase: {
      channel: (name: string) => {
        const ch = {
          name, bindings: [] as Binding[], removed: false, subCb: null as ((s: string) => void) | null,
          on(_t: string, filter: { table: string }, h: (p: unknown) => void) { this.bindings.push({ filter, h }); return this; },
          subscribe(cb: (s: string) => void) { this.subCb = cb; return this; },
        };
        rt.channels.push(ch);
        return ch;
      },
      removeChannel: async (ch: FakeChannel) => { ch.removed = true; return 'ok'; },
      from: (table: string) => { rt.fromTables.push(table); return builder; },
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: rt.userId ? { id: rt.userId } : null, authReady: true }),
}));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('@/contexts/StorageContext', () => ({ useStorage: () => ({ storageMode: 'cloud' }) }));
vi.mock('@/hooks/useExpenses', () => ({ useExpenses: () => ({ expenses: [] }) }));
vi.mock('@/hooks/useCustomCategories', () => ({ useCustomCategories: () => ({ customCategories: [] }) }));
vi.mock('@/lib/loadWithRetry', () => ({
  loadWithRetry: async () => ({
    budgetsData: [{ id: 'b1', name: 'B', total_amount: 100, period_type: 'monthly', alert_threshold: 80, user_id: 'u1' }],
    categoriesData: [],
  }),
  fetchFailureMessage: () => '',
}));

import { LiveDataProvider } from '@/contexts/LiveDataContext';
import { useBudgets } from '@/hooks/useBudgets';

const openChannels = () => (rt.channels as FakeChannel[]).filter((c) => !c.removed);
const fire = (table: string, payload: unknown) =>
  act(() => openChannels()[0].bindings.filter((b) => b.filter.table === table).forEach((b) => b.h(payload)));

let qc: QueryClient;
let invalidate: ReturnType<typeof vi.spyOn>;
const mount = () => render(<QueryClientProvider client={qc}><LiveDataProvider><div /></LiveDataProvider></QueryClientProvider>);
const krugKeys = () => invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

beforeEach(() => {
  vi.useFakeTimers();
  rt.channels.length = 0;
  rt.fromTables.length = 0;
  rt.userId = 'u1';
  __resetWalletsRefreshersForTests();
  qc = new QueryClient();
  invalidate = vi.spyOn(qc, 'invalidateQueries');
});
afterEach(() => vi.useRealTimers());

describe('Krug ledger on the live channel', () => {
  it('still one channel per user, now also bound to krug_settlement_ledger', () => {
    mount();
    expect(openChannels()).toHaveLength(1);
    expect(openChannels()[0].bindings.map((b) => b.filter.table)).toEqual(['custom_payment_sources', 'krug_settlement_ledger']);
  });

  it('a burst of ledger events gives one narrowed Krug refresh', async () => {
    mount();
    fire('krug_settlement_ledger', { new: { krug_id: 'k1' } });
    fire('krug_settlement_ledger', { new: { krug_id: 'k1' } });
    fire('krug_settlement_ledger', { new: { krug_id: 'k1' } });
    await vi.advanceTimersByTimeAsync(400);
    expect(krugKeys()).toEqual([['krug', 'settlement', 'k1'], ['krug', 'ledger', 'k1']]);
  });

  it('DELETE without data refreshes all open Krugs', async () => {
    mount();
    fire('krug_settlement_ledger', { eventType: 'DELETE', new: {}, old: { id: 'x' } });
    await vi.advanceTimersByTimeAsync(400);
    expect(krugKeys()).toEqual([['krug', 'settlement'], ['krug', 'ledger']]);
  });

  it('wallet and Krug in the same window: one fetch each, neither blocks the other', async () => {
    let releaseWallet: () => void = () => {};
    const wallet = vi.fn(() => new Promise<void>((r) => { releaseWallet = r; }));
    registerWalletsRefresher(wallet);
    mount();
    fire('custom_payment_sources', {});
    fire('krug_settlement_ledger', { new: { krug_id: 'k2' } });
    await vi.advanceTimersByTimeAsync(400);
    expect(wallet).toHaveBeenCalledTimes(1);
    expect(krugKeys()).toHaveLength(2); // Krug done while the wallet fetch is still running
    releaseWallet();
    await vi.advanceTimersByTimeAsync(2000);
    expect(wallet).toHaveBeenCalledTimes(1);
    expect(krugKeys()).toHaveLength(2);
  });
});

describe('Budgets', () => {
  it('own-fetch budget screens: a transactions signal burst gives one refresh', async () => {
    const pending = vi.fn().mockResolvedValue(undefined);
    registerLiveRefresher('transactions', pending);
    mount();
    for (let i = 0; i < 20; i++) markLiveDirty('transactions');
    await vi.advanceTimersByTimeAsync(400);
    expect(pending).toHaveBeenCalledTimes(1);
  });

  it('transactions signal is a no-op without an active provider', () => {
    const pending = vi.fn();
    registerLiveRefresher('transactions', pending);
    expect(() => markLiveDirty('transactions')).not.toThrow();
    expect(pending).not.toHaveBeenCalled();
  });

  it('useBudgets totals come from the live expenses state, not an own expenses fetch', async () => {
    const today = new Date();
    const exp = (id: string, amount: number) => ({
      id, amount, type: 'expense', status: 'approved', budget_id: 'b1', category: 'food', date: today,
    });
    const { result, rerender } = renderHook(
      ({ list }) => useBudgets({ externalExpenses: list as never }),
      { initialProps: { list: [exp('e1', 10)] } },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(result.current.budgets[0]?.spent).toBe(10);
    rerender({ list: [exp('e1', 10), exp('e2', 25)] });
    expect(result.current.budgets[0]?.spent).toBe(35);
    expect(rt.fromTables).not.toContain('expenses');
  });
});
