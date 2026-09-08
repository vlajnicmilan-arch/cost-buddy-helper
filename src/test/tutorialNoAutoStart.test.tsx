/**
 * Vodič od 6 koraka se više NE pokreće sam (Milanova odluka 8.9.2026.).
 * Ručni okidač (`startTutorial`) i dalje radi.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TutorialProvider, useTutorial } from '@/contexts/TutorialContext';

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

const Probe = () => {
  const { isActive, startTutorial } = useTutorial();
  return (
    <div>
      <span data-testid="active">{isActive ? 'yes' : 'no'}</span>
      <button onClick={startTutorial}>start</button>
    </div>
  );
};

describe('Tutorial auto-start', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    // Novi korisnik koji je prošao onboarding i izašao iz guided faze (3 unosa).
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('guided_home_exited_at:u1', new Date().toISOString());
  });

  it('ne pokreće se sam ni kad su svi stari uvjeti ispunjeni', () => {
    render(<TutorialProvider><Probe /></TutorialProvider>);

    act(() => {
      window.dispatchEvent(new CustomEvent('home-ready-for-tutorial'));
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByTestId('active').textContent).toBe('no');
  });

  it('ručni okidač i dalje pokreće vodič', () => {
    render(<TutorialProvider><Probe /></TutorialProvider>);

    act(() => {
      screen.getByText('start').click();
    });

    expect(screen.getByTestId('active').textContent).toBe('yes');
  });
});
