import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { AppStateProvider, useAppState } from '@/contexts/AppStateContext';

type AuthCb = (event: string, session: { user: { id: string } } | null) => void;

const state = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  cb: null as AuthCb | null,
}));

const makeQuery = (): any => {
  const q: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve({ data: null, error: null, count: 0 });
        }
        return () => q;
      },
    },
  );
  return q;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: state.userId ? { user: { id: state.userId } } : null },
      }),
      onAuthStateChange: (cb: AuthCb) => {
        state.cb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: () => makeQuery(),
  },
}));

const readySnapshots: boolean[] = [];
let markerMounts = 0;

const Marker = () => {
  const mounted = useRef(false);
  if (!mounted.current) {
    mounted.current = true;
    markerMounts += 1;
  }
  return <div data-testid="marker" />;
};

const Probe = () => {
  const { appStateReady } = useAppState();
  useEffect(() => {
    readySnapshots.push(appStateReady);
  }, [appStateReady]);
  // Isto ponašanje kao App.tsx: stablo se montira samo kad je appStateReady.
  return appStateReady ? <Marker /> : <div data-testid="loader" />;
};

const renderApp = () =>
  render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>,
  );

/**
 * Regresija: supabase-js emitira 'SIGNED_IN' i na povratak fokusa prozora te
 * na token refresh. Prije popravka je svaki takav event rušio appStateReady na
 * false → PageLoader → unmount cijelog stabla (korisnik izbačen na dashboard,
 * otvoreni dijalozi zatvoreni).
 */
describe('AppStateContext — SIGNED_IN ref-guard', () => {
  beforeEach(() => {
    readySnapshots.length = 0;
    markerMounts = 0;
    state.userId = 'user-1';
    state.cb = null;
    localStorage.clear();
    // Preskoči backfill grane koje bi udarale u bazu.
    localStorage.setItem('krug_mode_enabled', 'true');
    localStorage.setItem('projects_module_enabled', 'true');
  });

  it('ISTI korisnik: appStateReady ostaje true, stablo se NE remounta', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('marker')).toBeInTheDocument());
    const mountsBefore = markerMounts;

    await act(async () => {
      state.cb?.('SIGNED_IN', { user: { id: 'user-1' } });
    });

    expect(readySnapshots.includes(false)).toBe(false);
    expect(screen.getByTestId('marker')).toBeInTheDocument();
    expect(markerMounts).toBe(mountsBefore);
  });

  it('NOVI korisnik: puni reset (appStateReady pada na false, stablo se remounta)', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('marker')).toBeInTheDocument());
    const mountsBefore = markerMounts;

    state.userId = 'user-2';
    await act(async () => {
      state.cb?.('SIGNED_IN', { user: { id: 'user-2' } });
    });

    expect(readySnapshots).toContain(false);
    await waitFor(() => expect(screen.getByTestId('marker')).toBeInTheDocument());
    expect(markerMounts).toBe(mountsBefore + 1);
  });

  it('SIGNED_OUT ponašanje ostaje netaknuto (ready true, onboarding reset)', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('marker')).toBeInTheDocument());

    await act(async () => {
      state.cb?.('SIGNED_OUT', null);
    });

    expect(screen.getByTestId('marker')).toBeInTheDocument();
    expect(localStorage.getItem('user_display_name')).toBeNull();
  });
});
