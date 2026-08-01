import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BusinessWallet } from '@/components/business/BusinessWallet';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

vi.mock('@/components/custom-payment-sources/CustomPaymentSourcesPanel', () => ({
  CustomPaymentSourcesPanel: () => <div data-testid="sources-panel" />,
}));
vi.mock('@/components/PaymentSourceTransactionsDialog', () => ({
  PaymentSourceTransactionsDialog: () => null,
}));
vi.mock('@/components/wallet/SyncAllBankAccountsButton', () => ({
  SyncAllBankAccountsButton: () => <div />,
}));
vi.mock('@/components/OpenBankingPanel', () => ({
  OpenBankingPanel: () => <div data-testid="open-banking-panel" />,
}));
vi.mock('@/components/BankConnection', () => ({
  BankConnection: (props: { defaultBusinessPaymentSourceId?: string }) => (
    <div data-testid="bank-connection" data-source={props.defaultBusinessPaymentSourceId ?? ''} />
  ),
}));

vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({
    customPaymentSources: [
      { id: 'src-biz', name: 'Žiro', business_profile_id: 'biz-1' },
      { id: 'src-personal', name: 'Osobno', business_profile_id: null },
    ],
    loading: false,
  }),
}));
vi.mock('@/hooks/useExpenses', () => ({
  useExpenses: () => ({
    rawExpenses: [],
    allExpenses: [],
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    importFromCSV: vi.fn(),
    findDuplicates: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/contexts/AppStateContext', () => ({
  useAppState: () => ({ activeBusinessProfileId: 'biz-1' }),
}));

describe('BusinessWallet — Open Banking section', () => {
  it('renders Open Banking panel and BankConnection scoped to the active business source', () => {
    render(<BusinessWallet />);
    expect(screen.getByTestId('open-banking-panel')).toBeTruthy();
    const bank = screen.getByTestId('bank-connection');
    expect(bank.getAttribute('data-source')).toBe('src-biz');
  });
});
