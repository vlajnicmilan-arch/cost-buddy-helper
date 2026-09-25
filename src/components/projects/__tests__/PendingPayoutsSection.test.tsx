import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const m = vi.hoisted(() => ({ rows: [] as unknown[], dispatch: vi.fn() }));

vi.mock('react-i18next', async () => {
  const { createReactI18nextMock } = await import('@/test/mocks/reactI18next');
  return { ...createReactI18nextMock(), useTranslation: () => ({ t: (k: string) => k }) };
});
vi.mock('@/contexts/CurrencyContext', () => ({ useCurrency: () => ({ formatAmount: (n: number) => `${n} €` }) }));
vi.mock('@/lib/attribution/events', () => ({ dispatchAttributionOpen: m.dispatch }));
vi.mock('@/hooks/useMyPendingPayouts', async (orig) => {
  const actual = await orig<typeof import('@/hooks/useMyPendingPayouts')>();
  return { ...actual, useMyPendingPayouts: () => ({ data: m.rows }) };
});

import { PendingPayoutsSection } from '../PendingPayoutsSection';

const row = (o: Record<string, unknown>) => ({
  payout_id: 'p1', batch_id: null, project_id: 'proj', project_name: 'Kuća',
  paid_amount: 250, currency: 'EUR', paid_at: '2026-09-25T10:00:00Z', created_at: '2026-09-25T10:00:00Z', ...o,
});

describe('PendingPayoutsSection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders nothing without pending payouts', () => {
    m.rows = [];
    const { container } = render(<PendingPayoutsSection projectId="proj" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists only this project and opens the AttributionSheet on tap', () => {
    m.rows = [row({}), row({ payout_id: 'p2', project_id: 'other', paid_amount: 99 })];
    render(<PendingPayoutsSection projectId="proj" />);
    expect(screen.getByText('workLog.myPay.pending.title')).toBeInTheDocument();
    expect(screen.queryByText('99 €')).toBeNull();
    fireEvent.click(screen.getByText('250 €'));
    expect(m.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      action: 'created', payoutIds: ['p1'], batchId: null, paidAmountTotal: 250,
    }));
  });

  it('a batch opens with all its payout ids', () => {
    m.rows = [row({ batch_id: 'b1' }), row({ payout_id: 'p2', batch_id: 'b1', project_id: 'other', project_name: 'Stan' })];
    render(<PendingPayoutsSection projectId="proj" />);
    fireEvent.click(screen.getByText('250 €'));
    expect(m.dispatch).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'b1', payoutIds: ['p1', 'p2'], projectNames: ['Kuća', 'Stan'] }));
  });
});
