/**
 * Promjena računa bez SIGNED_OUT događaja (potvrdni link iz maila zamijeni
 * sesiju) mora očistiti korisničke localStorage ključeve prije čitanja profila.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  userId: 'u1' as string | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null });
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = maybeSingle;
  builder.update = () => builder;
  return {
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: state.userId ? { user: { id: state.userId } } : null },
        })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      from: vi.fn(() => builder),
    },
  };
});

import { AppStateProvider, useAppState } from '@/contexts/AppStateContext';

const Probe = () => {
  const { displayName, appStateReady } = useAppState();
  return <div data-testid="probe">{appStateReady ? `ready:${displayName}` : 'loading'}</div>;
};

const renderProvider = async () => {
  render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>,
  );
  // Čekamo dokaz da je resolveOnboarding stvarno prošao kroz granu sa sesijom.
  await waitFor(
    () => expect(localStorage.getItem('last_resolved_user_id')).toBe(state.userId),
    { timeout: 5000 },
  );
  await waitFor(() => expect(screen.getByTestId('probe').textContent).toMatch(/^ready:/), {
    timeout: 5000,
  });
};

describe('AppStateContext — promjena korisnika', () => {
  beforeEach(() => {
    localStorage.clear();
    state.userId = 'u1';
  });

  it('(a) drugi korisnik — korisnički ključevi obrisani, ime prazno', async () => {
    localStorage.setItem('last_resolved_user_id', 'u1');
    localStorage.setItem('user_display_name', 'Milan');
    state.userId = 'u2';

    await renderProvider();

    expect(localStorage.getItem('user_display_name')).toBeNull();
    expect(screen.getByTestId('probe').textContent).toBe('ready:');
    expect(localStorage.getItem('last_resolved_user_id')).toBe('u2');
  });

  it('(b) nema zapamćenog ID-a — ništa se ne briše', async () => {
    localStorage.setItem('user_display_name', 'Milan');
    state.userId = 'u1';

    await renderProvider();

    expect(localStorage.getItem('user_display_name')).toBe('Milan');
    expect(screen.getByTestId('probe').textContent).toBe('ready:Milan');
    expect(localStorage.getItem('last_resolved_user_id')).toBe('u1');
  });

  it('(c) isti korisnik — ništa se ne briše', async () => {
    localStorage.setItem('last_resolved_user_id', 'u1');
    localStorage.setItem('user_display_name', 'Milan');
    state.userId = 'u1';

    await renderProvider();

    expect(localStorage.getItem('user_display_name')).toBe('Milan');
    expect(screen.getByTestId('probe').textContent).toBe('ready:Milan');
  });
});
