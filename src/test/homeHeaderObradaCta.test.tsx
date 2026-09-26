// Početna više NEMA karticu „Pogledaj mjesec" — ulaz je premješten u izvješća.
// ReportsDialog iz HomeHeadera dobiva showMonthlyReview samo u osobnom načinu.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeHeader } from '@/components/home/HomeHeader';

const reportsDialogProps = vi.fn();
vi.mock('@/components/reports/ReportsDialog', () => ({
  ReportsDialog: (props: Record<string, unknown>) => {
    reportsDialogProps(props);
    return null;
  },
}));
vi.mock('@/components/NotificationsDropdown', () => ({ NotificationsDropdown: () => null }));
vi.mock('@/components/SettingsDialog', () => ({ SettingsDialog: () => null }));
vi.mock('@/components/add-expense/ScanTriggerButton', () => ({ ScanTriggerButton: () => null }));
vi.mock('@/components/add-expense/ManualAddTriggerButton', () => ({
  ManualAddTriggerButton: () => null,
}));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => null }));
vi.mock('@/assets/logo.webp', () => ({ default: 'logo.png' }));

const appState = { activeBusinessProfileId: null as string | null };
vi.mock('@/contexts/AppStateContext', () => ({
  useAppState: () => appState,
}));

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
}));

const renderHeader = () =>
  render(
    <MemoryRouter>
      <HomeHeader
        displayName="Test"
        isLocalMode={false}
        expenses={[]}
        reportsExpenses={[]}
        allExpenses={[]}
        onAddExpense={vi.fn()}
        onBulkUpdateExpenses={vi.fn()}
        onRefetch={vi.fn()}
      />
    </MemoryRouter>,
  );

describe('HomeHeader — kartica Mjesečni pogled uklonjena', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appState.activeBusinessProfileId = null;
  });

  it('nema kartice obrada-cta na Početnoj', () => {
    renderHeader();
    expect(screen.queryByTestId('obrada-cta')).toBeNull();
    expect(screen.queryByText('obrada.homeCta')).toBeNull();
  });

  it('u osobnom načinu izvješća primaju showMonthlyReview', () => {
    renderHeader();
    expect(reportsDialogProps.mock.calls.at(-1)?.[0]).toMatchObject({ showMonthlyReview: true });
  });

  it('u poslovnom načinu izvješća ne primaju showMonthlyReview', () => {
    appState.activeBusinessProfileId = 'biz-1';
    renderHeader();
    expect(reportsDialogProps.mock.calls.at(-1)?.[0]).toMatchObject({ showMonthlyReview: false });
  });
});
