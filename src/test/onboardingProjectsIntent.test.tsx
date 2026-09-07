/**
 * Onboarding routing po namjeri registracije.
 *
 * - intent 'projects' → poziva postojeću aktivaciju probe (`activateModuleTrial`)
 *   i navigira na odredište gumba "Novi projekt" (`/projects` + state.openNewProject).
 * - intent 'finance' → /home, kao i danas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  rpc: vi.fn(),
  activateTrial: vi.fn(),
  authEntry: {} as Record<string, unknown>,
  userMetadata: {} as Record<string, unknown>,
  funnel: vi.fn(),
  checkSubscription: vi.fn(),
  setOnboardingCompleted: vi.fn(),
}));

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k, i18n: { language: 'hr' } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => state.navigate,
}));

vi.mock('@/components/onboarding/steps/StepGreeting', () => ({
  StepGreeting: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => state.rpc(...args) },
}));

vi.mock('@/lib/activateModuleTrial', () => ({
  activateModuleTrial: (...args: unknown[]) => state.activateTrial(...args),
}));

vi.mock('@/lib/authFunnel', () => ({
  readAuthEntry: () => state.authEntry,
}));

vi.mock('@/lib/funnelTracking', () => ({
  logFunnelEvent: (...args: unknown[]) => { state.funnel(...args); return Promise.resolve(); },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', user_metadata: state.userMetadata } }),
}));

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ checkSubscription: state.checkSubscription }),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useAppState: () => ({
    setOnboardingCompleted: state.setOnboardingCompleted,
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

const submit = async () => {
  render(<Onboarding />);
  fireEvent.click(screen.getByRole('button', { name: /Krenimo/i }));
};

describe('Onboarding — signup intent routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('user_display_name', 'Test');
    state.authEntry = {};
    state.userMetadata = {};
    state.rpc.mockResolvedValue({ error: null });
    state.activateTrial.mockResolvedValue({ activated: true, period_end: '2026-10-01' });
    state.checkSubscription.mockResolvedValue(undefined);
  });

  it('projects: aktivira probu i vodi na odredište gumba "Novi projekt"', async () => {
    state.userMetadata = { signup_intent: 'projects' };
    await submit();

    await waitFor(() => expect(state.activateTrial).toHaveBeenCalledWith('projekti'));
    expect(state.navigate).toHaveBeenCalledWith('/projects', {
      state: { openNewProject: true },
      replace: true,
    });
    const complete = state.funnel.mock.calls.find((c) => c[0] === 'onboarding_complete');
    expect(complete?.[1]).toMatchObject({ intent: 'projects', trial_autostarted: true });
  });

  it('projects preko entry_path (Google/Apple u istom tabu)', async () => {
    state.authEntry = { entry_path: '/projekti' };
    await submit();

    await waitFor(() => expect(state.activateTrial).toHaveBeenCalledWith('projekti'));
    expect(state.navigate).toHaveBeenCalledWith('/projects', {
      state: { openNewProject: true },
      replace: true,
    });
  });

  it('neuspjela aktivacija probe ne blokira — i dalje vodi u modul Projekti', async () => {
    state.userMetadata = { signup_intent: 'projects' };
    state.activateTrial.mockRejectedValue(new Error('nope'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await submit();

    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/projects', {
      state: { openNewProject: true },
      replace: true,
    }));
    expect(warn).toHaveBeenCalled();
    const complete = state.funnel.mock.calls.find((c) => c[0] === 'onboarding_complete');
    expect(complete?.[1]).toMatchObject({ intent: 'projects', trial_autostarted: false });
    warn.mockRestore();
  });

  it('finance: ponašanje identično današnjem — /home, bez aktivacije probe', async () => {
    await submit();

    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/home', { replace: true }));
    expect(state.activateTrial).not.toHaveBeenCalled();
    const complete = state.funnel.mock.calls.find((c) => c[0] === 'onboarding_complete');
    expect(complete?.[1]).toMatchObject({ intent: 'finance', trial_autostarted: false });
  });
});
