/**
 * Guard: „Moji izdavatelji" i „Računi s izvoda" ne stvaraju nove scroll
 * sekcije — sklopivi su, zatvoreni po zadanom, s brojem stavki u naslovu.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { createReactI18nextMock } from '@/test/mocks/reactI18next';
vi.mock('react-i18next', () => ({
  ...createReactI18nextMock(),
  useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k, i18n: { language: 'hr' } }),
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children?: unknown }) => null,
  AlertDialogAction: () => null,
  AlertDialogCancel: () => null,
  AlertDialogContent: () => null,
  AlertDialogDescription: () => null,
  AlertDialogFooter: () => null,
  AlertDialogHeader: () => null,
  AlertDialogTitle: () => null,
}));

vi.mock('@/hooks/useMailImportAccess', () => ({
  useMailImportAccess: () => ({ hasAccess: true, loading: false }),
}));

vi.mock('@/hooks/useIssuerMemory', () => ({
  useIssuerMemory: () => ({
    entries: [
      { id: 'a', supplier_name: 'HEP', supplier_oib: '123', confirmed_count: 2, place_label: null, known_ibans: [], last_seen_at: null },
      { id: 'b', supplier_name: 'A1', supplier_oib: '456', confirmed_count: 1, place_label: null, known_ibans: [], last_seen_at: null },
    ],
    loading: false,
    working: false,
    forgetEntry: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStatementSourceMemory', () => ({
  useStatementSourceMemory: () => ({
    rules: [
      { id: 'r1', account_identifier: 'HR123', bank_name: 'OTP', payment_source_id: 's1', last_used_at: null },
    ],
    loading: false,
    working: false,
    forgetRule: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({ customPaymentSources: [{ id: 's1', name: 'OTP' }] }),
}));

import { MyIssuersSection } from '@/components/settings/MyIssuersSection';
import { StatementSourcesSection } from '@/components/settings/StatementSourcesSection';

describe('mail sekcije u postavkama su sklopive', () => {
  it('Moji izdavatelji: zatvoreno, broj u naslovu, dodir otvara', () => {
    render(<MyIssuersSection />);
    const toggle = screen.getByTestId('my-issuers-section-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.queryByText('HEP')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('HEP')).toBeInTheDocument();
  });

  it('Računi s izvoda: zatvoreno, broj u naslovu, dodir otvara', () => {
    render(<StatementSourcesSection />);
    const toggle = screen.getByTestId('statement-sources-section-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('(1)')).toBeInTheDocument();
    expect(screen.queryByText('HR123')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('HR123')).toBeInTheDocument();
  });
});
