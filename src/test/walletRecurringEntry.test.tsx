import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';

vi.mock('react-i18next', async () => (await import('./mocks/reactI18next')).reactI18nextMock);

const mockRows = [
  { id: '1', is_active: true },
  { id: '2', is_active: true },
  { id: '3', is_active: false },
];

vi.mock('@/hooks/useRecurringTransactions', () => ({
  useRecurringTransactions: () => ({ recurringTransactions: mockRows, loading: false }),
}));

import { WalletRecurringCard } from '@/components/wallet/WalletRecurringCard';

describe('personal recurring entry point', () => {
  it('renders a clickable recurring card with the active rule count', () => {
    const onClick = vi.fn();
    render(<WalletRecurringCard onClick={onClick} />);

    const card = screen.getByTestId('wallet-recurring-card');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('2');

    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Wallet page mounts the card and the existing recurring panel', () => {
    const src = readFileSync(path.resolve(__dirname, '../pages/Wallet.tsx'), 'utf8');
    expect(src).toContain('<WalletRecurringCard');
    expect(src).toContain('<RecurringTransactionsPanel');
    expect(src).toContain('setRecurringPanelOpen(true)');
  });
});
