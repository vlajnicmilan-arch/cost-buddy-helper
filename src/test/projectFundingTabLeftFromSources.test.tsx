/**
 * Tab Financiranje: brojka „Preostalo od izvora".
 * Kad nema alociranih izvora prikazuje se neutralno „—", ne negativni iznos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const formatAmount = (amount: number) =>
  `${amount.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatAmount }),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useAppState: () => ({}),
}));

vi.mock('@/hooks/useProjectEstimates', () => ({
  useProjectEstimates: () => ({ estimates: [] }),
}));

vi.mock('@/hooks/useProjectInvoices', () => ({
  useProjectInvoices: () => ({ invoices: [] }),
}));

vi.mock('@/components/projects/ProjectEstimatesPanel', () => ({
  ProjectEstimatesPanel: () => null,
}));

vi.mock('@/components/projects/ProjectInvoicesPanel', () => ({
  ProjectInvoicesPanel: () => null,
}));

vi.mock('@/lib/milestoneAmounts', () => ({
  sumVisibleAmounts: () => 0,
}));

import { ProjectFundingTab } from '@/components/projects/ProjectFundingTab';

const baseProps = {
  projectId: 'p1',
  funding: [],
  incomeSources: [],
  milestones: [],
  totalAllocated: 0,
  totalSpent: 0,
  projectBudget: 0,
  isManager: false,
  loading: false,
  onRefetch: vi.fn(),
  isReadOnly: false,
};

const valueEl = () => screen.getByTestId('left-from-sources-value');

describe('ProjectFundingTab — Preostalo od izvora', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) alocirano 0, potrošeno 125,50 → prikaz „—", bez crvene boje', () => {
    render(<ProjectFundingTab {...baseProps} totalAllocated={0} totalSpent={125.5} />);
    expect(valueEl().textContent).toBe('—');
    expect(valueEl().classList.contains('text-destructive')).toBe(false);
  });

  it('(b) alocirano 10.000, potrošeno 125,50 → prikaz 9.874,50 €', () => {
    render(<ProjectFundingTab {...baseProps} totalAllocated={10000} totalSpent={125.5} />);
    expect(valueEl().textContent).toBe('9.874,50 €');
    expect(valueEl().classList.contains('text-destructive')).toBe(false);
  });

  it('(c) alocirano manje od potrošenog → negativan iznos ostaje crven', () => {
    render(<ProjectFundingTab {...baseProps} totalAllocated={100} totalSpent={125.5} />);
    expect(valueEl().textContent).toBe('−25,50 €');
    expect(valueEl().classList.contains('text-destructive')).toBe(true);
  });
});
