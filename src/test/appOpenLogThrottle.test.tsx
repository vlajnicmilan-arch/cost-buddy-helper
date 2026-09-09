import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import { toDayKey } from '@/lib/dayKey';

const state = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  authStateCallback: null as null | ((event: string, session: any) => void),
  sessionUser: null as null | { id: string },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: any) => void) => {
        state.authStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () =>
        Promise.resolve({
          data: {
            session: state.sessionUser
              ? { user: state.sessionUser, access_token: 'tok' }
              : null,
          },
        }),
      getUser: () =>
        Promise.resolve({ data: { user: state.sessionUser }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: () => ({ insert: state.insertSpy }),
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null })) },
  },
}));

vi.mock('@/lib/authFunnel', () => ({ readAuthEntry: () => ({}) }));
vi.mock('@/lib/newsletterConsent', () => ({ flushPendingNewsletterConsent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/termsAcceptance', () => ({ flushPendingTermsAcceptance: vi.fn(() => Promise.resolve()) }));

import { AuthProvider } from '@/contexts/AuthContext';

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const appOpenInserts = () =>
  state.insertSpy.mock.calls.filter(
    ([row]) => (row as any)?.device_info?.eventType === 'app_open',
  );

describe('app_open dnevni throttle po uređaju', () => {
  beforeEach(() => {
    localStorage.clear();
    state.insertSpy.mockClear();
    state.authStateCallback = null;
    state.sessionUser = null;
  });

  it('(a) prvi app_open u danu upisuje u user_login_logs', async () => {
    state.sessionUser = { id: 'user-a' };
    render(<AuthProvider><div /></AuthProvider>);
    await flush();

    expect(appOpenInserts()).toHaveLength(1);
    expect(localStorage.getItem('login_log_app_open:user-a')).toBe(toDayKey(new Date()));
  });

  it('(b) drugi app_open isti dan NE upisuje', async () => {
    localStorage.setItem('login_log_app_open:user-a', toDayKey(new Date())!);
    state.sessionUser = { id: 'user-a' };
    render(<AuthProvider><div /></AuthProvider>);
    await flush();

    expect(appOpenInserts()).toHaveLength(0);
  });

  it('(c) drugi korisnik na istom uređaju upisuje', async () => {
    localStorage.setItem('login_log_app_open:user-a', toDayKey(new Date())!);
    state.sessionUser = { id: 'user-b' };
    render(<AuthProvider><div /></AuthProvider>);
    await flush();

    expect(appOpenInserts()).toHaveLength(1);
    expect((appOpenInserts()[0][0] as any).user_id).toBe('user-b');
  });

  it('(d) sign_in upisuje uvijek, bez obzira na dnevni throttle', async () => {
    // getSession bez sesije → nema app_open grane; ključ za danas već postoji.
    localStorage.setItem('login_log_app_open:user-c', toDayKey(new Date())!);
    render(<AuthProvider><div /></AuthProvider>);
    await flush();
    expect(appOpenInserts()).toHaveLength(0);

    act(() => {
      state.authStateCallback?.('SIGNED_IN', { user: { id: 'user-c' } });
    });
    await flush();

    const signIns = state.insertSpy.mock.calls.filter(
      ([row]) => (row as any)?.device_info?.eventType === 'sign_in',
    );
    expect(signIns).toHaveLength(1);
    expect((signIns[0][0] as any).user_id).toBe('user-c');
  });
});
