import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectEarnedValueCard } from './ProjectEarnedValueCard';
import type { Project } from '@/types/project';

// --- Mocks ---------------------------------------------------------------

// react-i18next: return the fallback string (second arg) so the test asserts
// on real Croatian copy without bootstrapping i18next.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'hr' },
  }),
}));

// Currency context: minimal stub.
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    formatAmount: (n: number) => `${n.toFixed(2)} €`,
    currency: { code: 'EUR', locale: 'hr-HR', symbol: '€', name: 'Euro' },
  }),
}));

// Status feedback: no-ops so the export button handler doesn't blow up if used.
vi.mock('@/hooks/useStatusFeedback', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// PDF export: avoid loading jspdf in jsdom.
vi.mock('@/lib/projectFinancePdfExport', () => ({
  exportEarnedValuePdf: vi.fn().mockResolvedValue(true),
}));

// --- Helpers -------------------------------------------------------------

const baseProject = (over: Partial<Project> = {}): Project =>
  ({
    id: 'p1',
    name: 'Test projekt',
    description: null,
    status: 'active',
    total_budget: 0,
    contract_value: null,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    user_id: 'u1',
    ...over,
  } as unknown as Project);

// --- Tests ---------------------------------------------------------------

describe('ProjectEarnedValueCard — contract baseline fallback', () => {
  it('shows the "enter contract" prompt when both contract_value and total_budget are missing', () => {
    render(
      <ProjectEarnedValueCard
        project={baseProject({ contract_value: null, total_budget: 0 })}
        spent={0}
        milestones={[]}
        onEnterContract={() => {}}
      />
    );
    expect(screen.getByText('Unesite ugovoreni iznos')).toBeInTheDocument();
    // EV title must NOT render in prompt mode
    expect(screen.queryByText('Earned Value')).not.toBeInTheDocument();
  });

  it('uses contract_value when it is set', () => {
    render(
      <ProjectEarnedValueCard
        project={baseProject({ contract_value: 33040, total_budget: 30000 })}
        spent={10000}
        milestones={[]}
        onEnterContract={() => {}}
      />
    );
    expect(screen.getByText('Earned Value')).toBeInTheDocument();
    expect(screen.getByText('33040.00 €')).toBeInTheDocument();
  });

  it('falls back to total_budget when contract_value is null (the Duje Grčić regression)', () => {
    render(
      <ProjectEarnedValueCard
        project={baseProject({ contract_value: null, total_budget: 30000 })}
        spent={5000}
        milestones={[]}
        onEnterContract={() => {}}
      />
    );
    // Card renders in normal (non-prompt) mode
    expect(screen.getByText('Earned Value')).toBeInTheDocument();
    // "Ugovoreno" amount reflects total_budget fallback (30 000 €), not 0
    expect(screen.getByText('30000.00 €')).toBeInTheDocument();
    expect(screen.queryByText('Unesite ugovoreni iznos')).not.toBeInTheDocument();
  });

  it('falls back to total_budget when contract_value is 0', () => {
    render(
      <ProjectEarnedValueCard
        project={baseProject({ contract_value: 0 as any, total_budget: 20000 })}
        spent={0}
        milestones={[]}
        onEnterContract={() => {}}
      />
    );
    expect(screen.getByText('Earned Value')).toBeInTheDocument();
    expect(screen.getByText('20000.00 €')).toBeInTheDocument();
  });
});
