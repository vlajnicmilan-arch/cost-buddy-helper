import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  addExpense: vi.fn(),
  logDiagnostic: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  refetch: vi.fn(() => Promise.resolve()),
  t: (k: string) => k,
  auth: { user: { id: 'worker' } },
  noopNavigate: () => {},
  sources: [{ id: 'src-1', name: 'Tekući', icon: '💳', balance: 0, currency: 'EUR' }],
  payouts: [{ payout_id: 'p1', batch_id: null, project_name: 'X', paid_amount: 250, paid_at: '2026-09-16T10:00:00Z', status: 'paid' }],
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc } }));
vi.mock('@/hooks/useExpenses', () => ({ useExpenses: () => ({ addExpense: m.addExpense }) }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: m.logDiagnostic }));
vi.mock('@/lib/buildStamp', () => ({ getBuildStamp: () => 'assets/index-TEST.js' }));
vi.mock('@/hooks/useStatusFeedback', () => ({ showError: m.showError, showSuccess: m.showSuccess }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: m.t }) }));
vi.mock('@/hooks/useBackButton', () => ({ useBackButton: () => {} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => m.noopNavigate }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => m.auth }));
vi.mock('@/contexts/CurrencyContext', () => ({ useCurrency: () => ({ formatAmount: (n: number) => String(n) }) }));
vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({ customPaymentSources: m.sources, loading: false }),
}));
vi.mock('@/lib/bankLinkedSources', () => ({ getBankLinkedSourceIds: () => Promise.resolve(new Set()) }));
vi.mock('@/lib/funnelTracking', () => ({ logFunnelEvent: () => Promise.resolve() }));
vi.mock('@/hooks/useIncomingPayoutAttribution', () => ({
  useIncomingPayoutAttribution: () => ({ loading: false, error: null, payouts: m.payouts, existing: null, refetch: m.refetch }),
}));

import { AttributionSheet } from '../AttributionSheet';

const payload = { payoutIds: ['p1'], batchId: null, action: 'created' } as never;

async function attribute() {
  fireEvent.click(await screen.findByText('Tekući'));
  fireEvent.click(screen.getByText('attribution.actions.attribute'));
}

describe('AttributionSheet → worker_confirm_payout_receipt', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls the RPC, never addExpense', async () => {
    m.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    render(<AttributionSheet open payload={payload} onClose={vi.fn()} />);
    await attribute();
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1));
    expect(m.rpc).toHaveBeenCalledWith('worker_confirm_payout_receipt', expect.objectContaining({
      p_payout_id: 'p1', p_source_id: 'src-1', p_client_request_id: expect.any(String),
    }));
    expect(m.addExpense).not.toHaveBeenCalled();
  });

  it('reuses one client_request_id per opening, new one after reopening', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    const { rerender } = render(<AttributionSheet open payload={payload} onClose={vi.fn()} />);
    await attribute();
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('attribution.actions.attribute'));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(2));
    const first = m.rpc.mock.calls[0][1].p_client_request_id;
    expect(m.rpc.mock.calls[1][1].p_client_request_id).toBe(first);

    rerender(<AttributionSheet open={false} payload={payload} onClose={vi.fn()} />);
    rerender(<AttributionSheet open payload={payload} onClose={vi.fn()} />);
    await attribute();
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(3));
    expect(m.rpc.mock.calls[2][1].p_client_request_id).not.toBe(first);
  });

  it('logs the literal error and shows a translated message', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'already_confirmed' } });
    render(<AttributionSheet open payload={payload} onClose={vi.fn()} />);
    await attribute();
    await waitFor(() => expect(m.logDiagnostic).toHaveBeenCalledTimes(1));
    const arg = m.logDiagnostic.mock.calls[0][0];
    expect(arg.event).toBe('worker_payout_receipt_error');
    expect(arg.details).toMatchObject({
      db_code: '22023', db_message: 'already_confirmed', build: 'assets/index-TEST.js',
      payout_id: 'p1', client_request_id: m.rpc.mock.calls[0][1].p_client_request_id,
    });
    expect(m.showError).toHaveBeenCalledWith('attribution.errors.alreadyAttributed');
    expect(m.refetch).toHaveBeenCalled();
  });

  it('unknown errors map to the generic translated message', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'source_not_writable' } });
    render(<AttributionSheet open payload={payload} onClose={vi.fn()} />);
    await attribute();
    await waitFor(() => expect(m.showError).toHaveBeenCalledWith('attribution.errors.generic'));
  });
});
