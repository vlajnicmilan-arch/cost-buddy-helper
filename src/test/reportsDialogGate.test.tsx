// Behavior testovi za gumb "Izvješća" (ReportsDialog):
//  (a) klik prije subscriptionReady → ništa (bez otvaranja dijaloga, bez reloada, bez navigacije)
//  (b) spremna pretplata + pravo → dijalog se otvara
//  (c) spremna pretplata bez prava → meka navigacija na /paywall (react-router, bez reloada)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportsDialog } from '@/components/reports/ReportsDialog';
import { BackButtonProvider } from '@/contexts/BackButtonContext';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const subscriptionState = { subscriptionReady: false };
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => subscriptionState,
}));

const featureAccessState = { hasAccess: (_feature: string) => true };
vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => featureAccessState,
}));

// Laki hookovi koje dijalog povlači, a ne utječu na gate.
vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({ customPaymentSources: [], isLoading: false }),
}));
vi.mock('@/hooks/useCustomIncomeCategories', () => ({
  useCustomIncomeCategories: () => ({ customIncomeCategories: [], isLoading: false }),
}));
vi.mock('@/hooks/useCustomCategories', () => ({
  useCustomCategories: () => ({ customCategories: [], isLoading: false }),
}));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `${n}`, currency: 'EUR' }),
}));
vi.mock('@/hooks/useStatusFeedback', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const renderDialog = () =>
  render(
    <MemoryRouter>
      <ReportsDialog expenses={[]} />
    </MemoryRouter>,
  );

const clickTrigger = () => {
  fireEvent.click(screen.getByRole('button', { name: /izvješća|reports/i }));
};

describe('ReportsDialog gate (gumb Izvješća)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionState.subscriptionReady = false;
    featureAccessState.hasAccess = () => true;
  });

  it('(a) klik prije subscriptionReady → ništa se ne događa', () => {
    subscriptionState.subscriptionReady = false;
    renderDialog();
    clickTrigger();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('(b) spremna pretplata + pravo → dijalog otvoren', () => {
    subscriptionState.subscriptionReady = true;
    featureAccessState.hasAccess = () => true;
    renderDialog();
    clickTrigger();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('(c) spremna pretplata bez prava → meka navigacija na /paywall, dijalog zatvoren', () => {
    subscriptionState.subscriptionReady = true;
    featureAccessState.hasAccess = () => false;
    renderDialog();
    clickTrigger();
    expect(navigateMock).toHaveBeenCalledWith('/paywall');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
