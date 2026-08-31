/**
 * Brana dohvata (`useAuthedFetchGate`) — jedno mjesto koje odlučuje smije li
 * upit krenuti. Testira se sama brana + tri predstavnika koji su je preuzeli:
 * `useProjectStats` (projekti), `useBudgetPendingTransactions` (novčanik) i
 * `useActivationFunnel` (admin metrika bez ikakve prijašnje provjere).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authReady: false,
  tables: [] as string[],
}));

const makeQuery = (): any =>
  new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 });
        }
        return () => makeQuery();
      },
    },
  );

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      state.tables.push(table);
      return makeQuery();
    },
    rpc: () => makeQuery(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, authReady: state.authReady }),
}));

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
}));

import { useAuthedFetchGate } from '@/hooks/useAuthedFetchGate';
import { useProjectStats } from '@/hooks/useProjectStats';
import { useBudgetPendingTransactions } from '@/hooks/useBudgetPendingTransactions';
import { useActivationFunnel } from '@/hooks/useActivationFunnel';

const reset = (user: { id: string } | null, authReady: boolean) => {
  state.tables.length = 0;
  state.user = user;
  state.authReady = authReady;
};

describe('useAuthedFetchGate — sama brana', () => {
  it('ne dopušta dohvat dok authReady nije true', () => {
    reset({ id: 'u1' }, false);
    const { result } = renderHook(() => useAuthedFetchGate());
    expect(result.current.canFetch).toBe(false);
    expect(result.current.userId).toBeNull();
    expect(result.current.isIdentityAlive()).toBe(false);
  });

  it('ne dopušta dohvat bez korisnika ni kad je prijava razriješena', () => {
    reset(null, true);
    const { result } = renderHook(() => useAuthedFetchGate());
    expect(result.current.canFetch).toBe(false);
    expect(result.current.isIdentityAlive()).toBe(false);
  });

  it('dopušta dohvat kad je prijava razriješena i korisnik postoji', () => {
    reset({ id: 'u1' }, true);
    const { result } = renderHook(() => useAuthedFetchGate());
    expect(result.current.canFetch).toBe(true);
    expect(result.current.userId).toBe('u1');
    expect(result.current.isIdentityAlive('u1')).toBe(true);
  });

  it('prijavljuje mrtav identitet kad se korisnik promijeni ili nestane', async () => {
    reset({ id: 'u1' }, true);
    const { result, rerender } = renderHook(() => useAuthedFetchGate());
    expect(result.current.isIdentityAlive('u1')).toBe(true);

    state.user = null;
    rerender();
    await waitFor(() => expect(result.current.isIdentityAlive('u1')).toBe(false));
  });
});

describe('predstavnici brane', () => {
  const cases: Array<{ name: string; run: () => void; table: string }> = [
    { name: 'useProjectStats', run: () => useProjectStats('p1', 0), table: 'expenses' },
    {
      name: 'useBudgetPendingTransactions',
      run: () => useBudgetPendingTransactions('b1'),
      table: 'budget_categories',
    },
    { name: 'useActivationFunnel', run: () => useActivationFunnel(), table: 'profiles' },
  ];

  for (const c of cases) {
    describe(c.name, () => {
      beforeEach(() => reset({ id: 'u1' }, false));

      it('ne dohvaća dok authReady nije true', async () => {
        renderHook(c.run);
        await new Promise(r => setTimeout(r, 20));
        expect(state.tables).toEqual([]);
      });

      it('ne dohvaća bez prijavljenog korisnika', async () => {
        reset(null, true);
        renderHook(c.run);
        await new Promise(r => setTimeout(r, 20));
        expect(state.tables).toEqual([]);
      });

      it('dohvaća tek kad je prijava razriješena', async () => {
        reset({ id: 'u1' }, true);
        renderHook(c.run);
        await waitFor(() => expect(state.tables).toContain(c.table));
      });
    });
  }
});
