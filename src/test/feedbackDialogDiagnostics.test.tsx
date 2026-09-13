/**
 * Dijalog povratne informacije uvijek šalje osnovnu dijagnostiku,
 * a zapis konzole samo kad je kvačica uključena.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  user: { id: 'u1', email: 'test@example.com' },
  submittedPayload: null as Record<string, any> | null,
}));

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'hr' } }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock('@/hooks/useBackButton', () => ({
  useBackButton: vi.fn(),
}));

vi.mock('@/hooks/useStatusFeedback', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: () => ({
      insert: (payload: Record<string, any>) => {
        state.submittedPayload = payload;
        return Promise.resolve({ error: null });
      },
    }),
    functions: {
      invoke: vi.fn(() => Promise.resolve({})),
    },
  },
}));

vi.mock('@/lib/version', () => ({
  APP_VERSION: '1.2.3',
  SHORT_COMMIT_SHA: 'abc1234',
}));

import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';

const renderDialog = (defaultType: 'bug' | 'idea' | 'question' = 'bug') =>
  render(
    <MemoryRouter>
      <FeedbackDialog open defaultType={defaultType} onOpenChange={vi.fn()} />
    </MemoryRouter>,
  );

describe('FeedbackDialog — dijagnostika', () => {
  beforeEach(() => {
    state.submittedPayload = null;
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 384 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 800 });
    Object.defineProperty(window, 'devicePixelRatio', { writable: true, configurable: true, value: 2 });
  });

  it('tip bug → kvačica za konzolu je uključena po zadanom', () => {
    renderDialog('bug');
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('tip idea → kvačica za konzolu je isključena po zadanom', () => {
    renderDialog('idea');
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('uvijek šalje osnovnu dijagnostiku bez obzira na kvačicu', async () => {
    renderDialog('bug');
    fireEvent.change(screen.getByPlaceholderText(/What were you trying/i), {
      target: { value: 'Nešto ne radi' },
    });
    // isključi konzolu
    screen.getByRole('switch').click();
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(state.submittedPayload).not.toBeNull());
    expect(state.submittedPayload?.app_version).toBe('1.2.3');
    expect(state.submittedPayload?.route).toBeDefined();
    expect(state.submittedPayload?.platform).toBeDefined();
    expect(state.submittedPayload?.user_agent).toBeDefined();
    expect(state.submittedPayload?.viewport).toBeDefined();
    expect(state.submittedPayload?.console_tail).toBeUndefined();
  });

  it('šalje console_tail samo kad je kvačica uključena', async () => {
    renderDialog('bug');
    fireEvent.change(screen.getByPlaceholderText(/What were you trying/i), {
      target: { value: 'Nešto ne radi' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(state.submittedPayload).not.toBeNull());
    expect(state.submittedPayload?.console_tail).toBeDefined();
  });
});
