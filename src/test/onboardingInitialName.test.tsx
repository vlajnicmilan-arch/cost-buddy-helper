/**
 * Početna vrijednost imena u onboardingu.
 *
 * Kad registracija traži potvrdu maila, sesije nema odmah pa display_name ne
 * stigne u profiles — ali preživi u user metadata. Onboarding ga mora
 * pokupiti odatle kad je localStorage prazan, umjesto da ponovno pita ime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
  userMetadata: {} as Record<string, unknown>,
}));

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({
    t: (_k: string, f?: unknown) =>
      typeof f === 'string' ? f
        : f && typeof f === 'object' && 'defaultValue' in f ? String((f as { defaultValue: unknown }).defaultValue)
          : _k,
    i18n: { language: 'hr' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => (props: Record<string, unknown>) => {
      const { children, ...rest } = props;
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (!['initial', 'animate', 'exit', 'transition', 'key'].includes(k)) clean[k] = v;
      }
      return <div {...clean}>{children as React.ReactNode}</div>;
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) },
}));

vi.mock('@/lib/authFunnel', () => ({ readAuthEntry: () => ({}) }));
vi.mock('@/lib/funnelTracking', () => ({ logFunnelEvent: () => Promise.resolve() }));
vi.mock('@/lib/signupIntent', () => ({ resolveSignupIntent: () => 'finance' }));
vi.mock('@/lib/activateModuleTrial', () => ({ activateModuleTrial: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', user_metadata: state.userMetadata } }),
}));

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ checkSubscription: vi.fn() }),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useAppState: () => ({
    setOnboardingCompleted: vi.fn(),
    setDisplayName: vi.fn(),
    setUsageProfile: vi.fn(),
  }),
}));

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ lightTap: () => Promise.resolve(), successVibration: () => Promise.resolve() }),
}));

vi.mock('@/hooks/useStatusFeedback', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

import Onboarding from '@/pages/Onboarding';

describe('Onboarding — početno ime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    state.userMetadata = {};
  });

  it('ime iz user_metadata.display_name kad je localStorage prazan', () => {
    state.userMetadata = { display_name: 'Ana' };
    render(<Onboarding />);

    const input = screen.getByPlaceholderText('npr. Marko') as HTMLInputElement;
    expect(input.value).toBe('Ana');
    // gumb "Krenimo" je omogućen jer ime postoji
    expect(screen.getByRole('button', { name: /Krenimo/i })).not.toBeDisabled();
  });

  it('metadata ima prednost nad localStorage', () => {
    localStorage.setItem('user_display_name', 'Marko');
    state.userMetadata = { display_name: 'Ana' };
    render(<Onboarding />);

    const input = screen.getByPlaceholderText('npr. Marko') as HTMLInputElement;
    expect(input.value).toBe('Ana');
  });

  it('localStorage kad metadata nema', () => {
    localStorage.setItem('user_display_name', 'Marko');
    render(<Onboarding />);

    const input = screen.getByPlaceholderText('npr. Marko') as HTMLInputElement;
    expect(input.value).toBe('Marko');
  });


  it('oba izvora prazna — polje prazno, gumb onemogućen', () => {
    render(<Onboarding />);

    const input = screen.getByPlaceholderText('npr. Marko') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(screen.getByRole('button', { name: /Krenimo/i })).toBeDisabled();
  });
});
