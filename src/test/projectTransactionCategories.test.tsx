import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectTransactionAddDialog } from '@/components/projects/project-transactions/ProjectTransactionAddDialog';
import { BackButtonProvider } from '@/contexts/BackButtonContext';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

vi.mock('@/components/add-expense/AdvanceLinkSection', () => ({
  AdvanceLinkSection: () => null,
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  projectId: 'p1',
  saving: false,
  expenseType: 'expense' as const,
  setExpenseType: vi.fn(),
  amount: '',
  setAmount: vi.fn(),
  description: '',
  setDescription: vi.fn(),
  category: 'material' as never,
  setCategory: vi.fn(),
  date: new Date('2026-01-15T00:00:00Z'),
  setDate: vi.fn(),
  milestoneId: 'none',
  setMilestoneId: vi.fn(),
  paymentSourceValue: 'cash',
  setPaymentSourceValue: vi.fn(),
  expenseNature: 'regular' as const,
  setExpenseNature: vi.fn(),
  isAdvance: false,
  setIsAdvance: vi.fn(),
  collaboratorId: null,
  setCollaboratorId: vi.fn(),
  linkedAdvanceIds: [],
  setLinkedAdvanceIds: vi.fn(),
  addDateOpen: false,
  setAddDateOpen: vi.fn(),
  milestones: [],
  customPaymentSources: [],
  currencySymbol: '€',
  formatAmount: (n: number) => `${n} €`,
  addDateRangeLimits: {} as never,
  onCancel: vi.fn(),
  onSubmit: vi.fn(),
};

describe('(b) dijalog troška u projektu koristi projektne kategorije', () => {
  it('projekt tipa renovation nudi "Rušenje i odvoz", ne "Hrana"', () => {
    render(
      <MemoryRouter>
        <BackButtonProvider>
          <ProjectTransactionAddDialog {...baseProps} projectType="renovation" />
        </BackButtonProvider>
      </MemoryRouter>,
    );

    const triggers = screen.getAllByRole('combobox');
    fireEvent.keyDown(triggers[0], { key: 'Enter' });

    expect(screen.getByText('Rušenje i odvoz')).toBeTruthy();
    expect(screen.getAllByText('Materijal').length).toBeGreaterThan(0);
    expect(screen.queryByText('Hrana')).toBeNull();
    expect(screen.queryByText('Ljubimci')).toBeNull();
  });
});
