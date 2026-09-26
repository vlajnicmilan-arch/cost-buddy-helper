import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
}));

const mockIsBusinessView = vi.fn(() => false);
vi.mock('@/contexts/WalletViewModeContext', () => ({
  useWalletViewMode: () => ({ isBusinessView: mockIsBusinessView() }),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `${n.toFixed(2)} €` }),
}));

const mockExpenses = vi.fn((): unknown[] => []);
vi.mock('@/hooks/useExpenses', () => ({
  useExpenses: () => ({
    expenses: mockExpenses(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
  }),
}));

vi.mock('@/hooks/useBudgets', () => ({
  useBudgets: () => ({ budgets: [] }),
}));

vi.mock('@/hooks/useRecurringTransactions', () => ({
  useRecurringTransactions: () => ({ recurringTransactions: [] }),
}));

vi.mock('@/components/TransactionListDialog', () => ({
  TransactionListDialog: () => null,
}));

import Obrada from '../Obrada';

const renderPage = () =>
  render(
    <MemoryRouter>
      <Obrada />
    </MemoryRouter>,
  );

describe('Obrada — Mjesečni pogled', () => {
  beforeEach(() => {
    mockIsBusinessView.mockReturnValue(false);
    mockExpenses.mockReturnValue([]);
  });

  it('prikazuje sažetak i sve sekcije', () => {
    renderPage();
    expect(screen.getByTestId('obrada-summary')).toBeTruthy();
    expect(screen.getByTestId('obrada-leaks')).toBeTruthy();
    expect(screen.getByTestId('obrada-recurring')).toBeTruthy();
    expect(screen.getByTestId('obrada-markers')).toBeTruthy();
    expect(screen.getByTestId('obrada-overbudget')).toBeTruthy();
    expect(screen.getByTestId('obrada-loans')).toBeTruthy();
  });

  it('izbor mjeseca mijenja naslov', () => {
    renderPage();
    const title = screen.getByRole('heading', { level: 1 }).textContent;
    fireEvent.click(screen.getByLabelText('obrada.prevMonth'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(title);
  });

  it('u poslovnom načinu prikazuje poruku umjesto podataka', () => {
    mockIsBusinessView.mockReturnValue(true);
    renderPage();
    expect(screen.queryByTestId('obrada-summary')).toBeNull();
    expect(screen.getByText('obrada.personalOnly')).toBeTruthy();
  });

  it('brojke sažetka poklapaju se s isRealSpend/isRealIncome na istim redcima', () => {
    mockExpenses.mockReturnValue([
      { id: '1', amount: 1000, type: 'income', category: 'salary', date: new Date(), description: 'Plaća' },
      { id: '2', amount: 120, type: 'expense', category: 'groceries', date: new Date(), description: 'Konzum' },
      { id: '3', amount: 30, type: 'expense', category: 'groceries', date: new Date(), description: 'Korekcija', expense_nature: 'correction' },
    ]);
    renderPage();
    const summary = screen.getByTestId('obrada-summary');
    expect(summary.textContent).toContain('1000.00');
    expect(summary.textContent).toContain('120.00');
    expect(summary.textContent).toContain('880.00');
  });
});
