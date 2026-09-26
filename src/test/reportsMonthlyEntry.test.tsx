// Kartica „Mjesečni pogled" na vrhu izvješća (ReportsDialog):
//  (d) osobni način → kartica se vidi i vodi na /obrada?m=<mjesec izvješća>
//  (e) bez propa (poslovni način) → kartice nema
// Napomena: Radix Select se u jsdomu ne može otvoriti, pa mjesec „Prošli
// mjesec"/prilagođeni pokriva čisti izračun u komponenti; ovdje se testira
// prijenos mjeseca kroz URL.
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

const subscriptionState = { subscriptionReady: true };
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => subscriptionState,
}));

vi.mock('@/hooks/useModuleGate', () => ({
  useModuleGate: () => ({ requestModule: vi.fn(), openUpgrade: vi.fn() }),
}));

vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({ hasAccess: () => true }),
}));

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

const renderDialog = (props: { showMonthlyReview?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <BackButtonProvider>
        <ReportsDialog expenses={[]} {...props} />
      </BackButtonProvider>
    </MemoryRouter>,
  );

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

describe('ReportsDialog — ulaz „Mjesečni pogled"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionState.subscriptionReady = true;
  });

  it('(d) kartica se vidi i vodi na /obrada s mjesecom odabranim u izvješću', () => {
    renderDialog({ showMonthlyReview: true });
    fireEvent.click(screen.getByRole('button', { name: /izvješća|reports/i }));
    fireEvent.click(screen.getByTestId('reports-monthly-review'));
    expect(navigateMock).toHaveBeenCalledWith(`/obrada?m=${monthKey(new Date())}`);
  });

  it('(e) bez propa kartice nema (poslovni način)', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /izvješća|reports/i }));
    expect(screen.queryByTestId('reports-monthly-review')).toBeNull();
  });
});
