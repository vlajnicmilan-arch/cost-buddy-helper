/**
 * Početna — kartica aktivnog projekta: "Ugovoreno" mora biti contracted
 * (contract_value), a ne budžet; "Trošak" i "Neutrošeno" ostaju protiv budžeta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ProjectWithOwnership } from '@/types/project';

const formatAmount = (amount: number) =>
  `${amount.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const summary = vi.hoisted(() => new Map<string, { spent: number; income: number; txCount: number }>());

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

vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({ hasAccess: () => true }),
}));

vi.mock('@/hooks/useModuleStates', () => ({
  useModuleStates: () => ({ projects: { enabled: true, tierUnlocked: true } }),
}));

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ lightTap: vi.fn() }),
}));

vi.mock('@/hooks/useModuleGate', () => ({
  useModuleGate: () => ({ requestModule: vi.fn() }),
}));

vi.mock('@/hooks/useActiveProjectsSummary', () => ({
  useActiveProjectsSummary: () => ({ summary, loading: false, refetch: vi.fn() }),
}));

import { ActiveProjectsStrip } from '@/components/home/ActiveProjectsStrip';

const baseProject: ProjectWithOwnership = {
  id: 'p1',
  user_id: 'u1',
  name: 'Adaptacija stana',
  description: null,
  icon: '🏠',
  color: '#3b82f6',
  status: 'active',
  total_budget: 40000,
  contract_value: 50000,
  start_date: null,
  end_date: null,
  business_profile_id: null,
  archived_at: null,
  project_type: 'renovation',
  isOwner: true,
  role: 'owner',
};

const renderStrip = (projects: ProjectWithOwnership[]) =>
  render(<ActiveProjectsStrip projects={projects} isLocalMode={false} isBusinessMode={false} />);

describe('ActiveProjectsStrip — Ugovoreno na kartici', () => {
  beforeEach(() => {
    summary.clear();
  });

  it('fixture 40.000/50.000/125,50 → Ugovoreno 50.000,00 €, Neutrošeno 39.874,50 €', () => {
    summary.set('p1', { spent: 125.5, income: 0, txCount: 1 });
    renderStrip([baseProject]);

    expect(screen.getByText('Ugovoreno')).toBeInTheDocument();
    expect(screen.getByText('50.000,00 €')).toBeInTheDocument();
    expect(screen.getByText('Trošak')).toBeInTheDocument();
    expect(screen.getByText('125,50 €')).toBeInTheDocument();
    expect(screen.getByText('+39.874,50 €')).toBeInTheDocument();
  });

  it('bez upisanog ugovora → Ugovoreno je procjena iz budžeta i prikazuje napomenu', () => {
    summary.set('p1', { spent: 125.5, income: 0, txCount: 1 });
    renderStrip([{ ...baseProject, contract_value: null }]);

    expect(screen.getByText('Ugovoreno')).toBeInTheDocument();
    expect(screen.getByText('40.000,00 €')).toBeInTheDocument();
    expect(screen.getByText('procjena iz budžeta')).toBeInTheDocument();
  });
});
