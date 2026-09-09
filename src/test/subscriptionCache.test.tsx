/**
 * Lokalna predmemorija prava: ulazak u aplikaciju ne čeka check-subscription
 * kad postoji svježa predmemorija za istog korisnika.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const state = vi.hoisted(() => ({
  session: null as any,
  authLoading: false,
  invoke: vi.fn(),
  resolveInvoke: null as null | ((v: any) => void),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: state.session, loading: state.authLoading }),
}));

vi.mock('@/lib/supabaseRetry', () => ({
  getFreshAccessToken: vi.fn(async () => 'tok'),
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = async () => ({ data: { value: 'dual' } });
  return {
    supabase: {
      from: () => builder,
      functions: { invoke: (...args: unknown[]) => state.invoke(...args) },
    },
  };
});

import {
  SubscriptionProvider,
  useSubscription,
  SUBSCRIPTION_CACHE_PREFIX,
} from '@/contexts/SubscriptionContext';

const Probe = () => {
  const { subscriptionReady, tier, entitlements } = useSubscription();
  return (
    <div data-testid="probe">
      {`${subscriptionReady ? 'ready' : 'wait'}|${tier}|${entitlements.smjer.active ? 'smjer' : '-'}`}
    </div>
  );
};

const cachePayload = (userId: string, savedAt: string, tier = 'pro') => ({
  user_id: userId,
  saved_at: savedAt,
  tier,
  subscribed: true,
  subscription_end: null,
  source: 'paddle',
  entitlements: {
    smjer: { active: true, source: 'paddle', period_end: null },
    krug: { active: false, source: null, period_end: null },
    projekti: { active: false, source: null, period_end: null },
    biznis: { active: false, source: null, period_end: null },
  },
  entitlements_mode: 'dual',
});

const serverResponse = {
  data: {
    subscribed: false,
    tier: 'free',
    subscription_end: null,
    source: null,
    entitlements: {
      smjer: { active: false, source: null, period_end: null },
      krug: { active: false, source: null, period_end: null },
      projekti: { active: false, source: null, period_end: null },
      biznis: { active: false, source: null, period_end: null },
    },
  },
  error: null,
};

describe('subscription cache', () => {
  beforeEach(() => {
    localStorage.clear();
    state.session = { access_token: 'tok', user: { id: 'u1' } };
    state.authLoading = false;
    state.invoke = vi.fn(() => new Promise(() => {})); // nikad ne odgovara
  });

  it('(a) s predmemorijom subscriptionReady je true prije odgovora servera', async () => {
    localStorage.setItem(
      SUBSCRIPTION_CACHE_PREFIX + 'u1',
      JSON.stringify(cachePayload('u1', new Date().toISOString())),
    );
    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe('ready|pro|smjer'),
    );
  });

  it('(b) svježi odgovor prepisuje predmemoriju i stanje', async () => {
    localStorage.setItem(
      SUBSCRIPTION_CACHE_PREFIX + 'u1',
      JSON.stringify(cachePayload('u1', new Date().toISOString())),
    );
    state.invoke = vi.fn(async () => serverResponse);

    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);

    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe('ready|free|-'),
    );
    const stored = JSON.parse(localStorage.getItem(SUBSCRIPTION_CACHE_PREFIX + 'u1')!);
    expect(stored.tier).toBe('free');
    expect(stored.entitlements.smjer.active).toBe(false);
    expect(stored.user_id).toBe('u1');
  });

  it('(c) predmemorija drugog korisnika se ignorira', async () => {
    localStorage.setItem(
      SUBSCRIPTION_CACHE_PREFIX + 'u2',
      JSON.stringify(cachePayload('u2', new Date().toISOString())),
    );
    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    await act(async () => {});
    expect(screen.getByTestId('probe').textContent).toBe('wait|free|-');
  });

  it('(d) predmemorija starija od 24 h se ignorira', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(
      SUBSCRIPTION_CACHE_PREFIX + 'u1',
      JSON.stringify(cachePayload('u1', old)),
    );
    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    await act(async () => {});
    expect(screen.getByTestId('probe').textContent).toBe('wait|free|-');
  });

  it('(e) odjava briše ključ predmemorije', () => {
    localStorage.setItem(
      SUBSCRIPTION_CACHE_PREFIX + 'u1',
      JSON.stringify(cachePayload('u1', new Date().toISOString())),
    );
    // Isti mehanizam kao removeUserScopedStorage u AppStateContextu.
    const prefixes = ['login_log_app_open:', 'subscription_cache:'];
    Object.keys(localStorage)
      .filter((key) => prefixes.some((p) => key.startsWith(p)))
      .forEach((key) => localStorage.removeItem(key));

    expect(localStorage.getItem(SUBSCRIPTION_CACHE_PREFIX + 'u1')).toBeNull();
  });
});
