/**
 * Regresija: dohvat troškova se NE smije pokrenuti dok stanje prijave nije
 * poznato (`authReady === false`).
 *
 * Kad se upit izvrši prije prijave, PostgREST ga izvodi kao `anon`, a RLS na
 * `expenses` zove `is_project_participant_active` na koju `anon` nema pravo →
 * `permission denied for function is_project_participant_active`
 * (dijagnostika: `expense_fetch_failed`, ruta `/auth`).
 *
 * Popravak je u tome da se upit ne dogodi — prava se NE mijenjaju.
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
          return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
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
    channel: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }) }),
    removeChannel: () => {},
    auth: {
      refreshSession: async () => ({}),
      getUser: async () => ({ data: { user: null } }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, authReady: state.authReady }),
}));

vi.mock('@/contexts/StorageContext', () => ({
  useStorage: () => ({ storageMode: 'cloud' }),
}));

vi.mock('@/contexts/WalletViewModeContext', () => ({
  useWalletViewMode: () => ({
    businessProfileId: null,
    isPersonalView: true,
    isBusinessView: false,
  }),
}));

vi.mock('@/hooks/useHiddenPaymentSources', () => ({
  useHiddenPaymentSources: () => ({ hiddenIds: new Set(), isHidden: () => false }),
}));

vi.mock('@/hooks/useAppResume', () => ({ useAppResume: () => {} }));

import { useExpenseFetch } from '@/hooks/useExpenseFetch';

describe('useExpenseFetch — brana na spremnost prijave', () => {
  beforeEach(() => {
    state.tables.length = 0;
    state.user = null;
    state.authReady = false;
    localStorage.clear();
  });

  it('ne dohvaća troškove dok authReady nije true (neprijavljen, /auth)', async () => {
    renderHook(() => useExpenseFetch());
    await new Promise(r => setTimeout(r, 20));
    expect(state.tables).toEqual([]);
  });

  it('ne dohvaća troškove ni kad korisnik postoji, ali authReady još nije true', async () => {
    state.user = { id: 'user-1' };
    state.authReady = false;
    renderHook(() => useExpenseFetch());
    await new Promise(r => setTimeout(r, 20));
    expect(state.tables).toEqual([]);
  });

  it('dohvaća tek kad je authReady true i korisnik prijavljen', async () => {
    state.user = { id: 'user-1' };
    state.authReady = true;
    renderHook(() => useExpenseFetch());
    await waitFor(() => expect(state.tables).toContain('expenses'));
  });
});
