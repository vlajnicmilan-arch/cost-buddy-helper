/**
 * Regresija: svaki auth događaj (TOKEN_REFRESHED, SIGNED_IN na povratku u
 * prvi plan) donosi NOVI `user` objekt istog korisnika. Deseci hookova imaju
 * `user` u ovisnostima → val od stotinjak zahtjeva. Referenca se smije
 * promijeniti samo kad se korisnik stvarno promijeni.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { isSameUserIdentity, pickStableUser } from '@/lib/stableAuthIdentity';
import { runSingleFlight, __resetInFlightLoadsForTests, loadWithRetry } from '@/lib/loadWithRetry';

type AuthCb = (event: string, session: any) => void;

const state = vi.hoisted(() => ({ cb: null as AuthCb | null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.hr', updated_at: 't0' } } } }),
      getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.hr', updated_at: 't0' } }, error: null }),
      onAuthStateChange: (cb: AuthCb) => {
        state.cb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: async () => ({ error: null }),
    },
    from: () => ({ insert: () => ({ then: (r: any) => r({}) }) }),
    functions: { invoke: async () => ({ data: null }) },
  },
}));

vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));

import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';

describe('pickStableUser', () => {
  it('isti identitet zadržava postojeću referencu', () => {
    const prev = { id: 'u1', email: 'a@b.hr', updated_at: 't0' };
    const next = { id: 'u1', email: 'a@b.hr', updated_at: 't0' };
    expect(isSameUserIdentity(prev, next)).toBe(true);
    expect(pickStableUser(prev, next)).toBe(prev);
  });

  it('drugi korisnik ili promjena profila daje novu referencu', () => {
    const prev = { id: 'u1', email: 'a@b.hr', updated_at: 't0' };
    expect(pickStableUser(prev, { id: 'u2', email: 'a@b.hr', updated_at: 't0' })).not.toBe(prev);
    expect(pickStableUser(prev, { id: 'u1', email: 'a@b.hr', updated_at: 't1' })).not.toBe(prev);
    expect(pickStableUser(prev, null)).toBeNull();
  });
});

describe('AuthContext — TOKEN_REFRESHED', () => {
  it('ne mijenja referencu `user` za istog korisnika', async () => {
    const seen: (unknown | null)[] = [];
    const Probe = () => {
      const { user } = useAuthContext();
      seen.push(user);
      return null;
    };
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(seen.some(u => u !== null)).toBe(true));
    const before = seen[seen.length - 1];

    await act(async () => {
      state.cb?.('TOKEN_REFRESHED', {
        access_token: 'new',
        user: { id: 'u1', email: 'a@b.hr', updated_at: 't0' },
      });
    });

    expect(seen[seen.length - 1]).toBe(before);
  });
});

describe('dijeljenje dohvata po dosegu', () => {
  beforeEach(() => __resetInFlightLoadsForTests());

  it('5 istovremenih instanci istog dosega = 1 lanac zahtjeva', async () => {
    let calls = 0;
    const load = () =>
      loadWithRetry('payment_sources', async () => {
        calls += 1;
        await new Promise(r => setTimeout(r, 10));
        return 'ok';
      }, { singleFlightKey: 'payment_sources:u1:personal:excl' });

    const results = await Promise.all([load(), load(), load(), load(), load()]);
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(calls).toBe(1);
  });

  it('različit doseg = zaseban lanac', async () => {
    let calls = 0;
    const run = (key: string) =>
      runSingleFlight(key, async () => {
        calls += 1;
        await new Promise(r => setTimeout(r, 5));
        return key;
      });
    await Promise.all([run('payment_sources:u1:personal:excl'), run('payment_sources:u1:biz:excl')]);
    expect(calls).toBe(2);
  });
});
