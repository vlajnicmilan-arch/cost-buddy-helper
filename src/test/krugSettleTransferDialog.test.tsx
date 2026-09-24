import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mutateAsync = vi.fn().mockResolvedValue({ ok: true, id: 'l1' });
vi.mock('@/hooks/useBackButton', () => ({ useBackButton: () => {} }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/hooks/useKrugSettlementMutations', () => ({
  useKrugMarkSettledWithSource: () => ({ mutateAsync, isPending: false }),
  useLatestKrugFxSnapshot: () => ({ data: null }),
}));
vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({
    customPaymentSources: [
      { id: 'rev', name: 'Revolut', currency: 'EUR', myRole: 'owner' },
      { id: 'usd', name: 'USD', currency: 'USD', myRole: 'owner' },
      { id: 'view', name: 'View', currency: 'EUR', myRole: 'viewer' },
    ],
    refetch: vi.fn(),
  }),
}));
// Replace the Radix picker with plain buttons; the dialog logic is under test.
vi.mock('@/components/krug/KrugSettleSourceFields', () => ({
  KrugSettleSourceFields: (p: any) => (
    <div>
      {p.sources.map((s: any) => (
        <button key={s.id} onClick={() => p.onSourceChange(s.id)}>pick-{s.id}</button>
      ))}
      {p.showPayerAmount && (
        <input aria-label="payer" value={p.payerAmount} onChange={(e) => p.onPayerAmountChange(e.target.value)} />
      )}
    </div>
  ),
}));

import { KrugSettleTransferDialog } from '@/components/krug/KrugSettleTransferDialog';

const transfer = { fromUser: 'p', toUser: 'm', amount: 20, currency: 'EUR', fromName: 'Petar', toName: 'Milan' };
const renderOpen = () => render(
  <KrugSettleTransferDialog krugId="k" open onOpenChange={() => {}} transfer={transfer} />,
);
const passDebounce = () => act(() => { vi.advanceTimersByTime(3500); });

describe('KrugSettleTransferDialog', () => {
  beforeEach(() => { vi.useFakeTimers(); mutateAsync.mockClear(); });

  it('does not offer viewer sources and does not send without a source', () => {
    renderOpen(); passDebounce();
    expect(screen.queryByText('pick-view')).toBeNull();
    const btn = screen.getByTestId('settle-confirm');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('different currency blocks until the paid amount is entered', async () => {
    renderOpen(); passDebounce();
    fireEvent.click(screen.getByText('pick-usd'));
    expect(screen.getByTestId('settle-confirm')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('payer'), { target: { value: '22,75' } });
    await act(async () => { fireEvent.click(screen.getByTestId('settle-confirm')); });
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ payerSourceId: 'usd', payerAmount: 22.75 }));
  });

  it('uses one client_request_id per opening, also on double click and retry', async () => {
    let resolve!: (v: unknown) => void;
    mutateAsync.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    renderOpen(); passDebounce();
    fireEvent.click(screen.getByText('pick-rev'));
    const btn = screen.getByTestId('settle-confirm');
    await act(async () => { fireEvent.click(btn); fireEvent.click(btn); });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ok: true }); });
    mutateAsync.mockRejectedValueOnce(new Error('x'));
    await act(async () => { fireEvent.click(btn); });
    const ids = mutateAsync.mock.calls.map((c) => c[0].clientRequestId);
    expect(new Set(ids).size).toBe(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ payerSourceId: 'rev', payerAmount: null });
  });

  it('a new opening gets a new client_request_id', async () => {
    const { rerender } = renderOpen(); passDebounce();
    fireEvent.click(screen.getByText('pick-rev'));
    await act(async () => { fireEvent.click(screen.getByTestId('settle-confirm')); });
    rerender(<KrugSettleTransferDialog krugId="k" open={false} onOpenChange={() => {}} transfer={transfer} />);
    rerender(<KrugSettleTransferDialog krugId="k" open onOpenChange={() => {}} transfer={transfer} />);
    passDebounce();
    fireEvent.click(screen.getByText('pick-rev'));
    await act(async () => { fireEvent.click(screen.getByTestId('settle-confirm')); });
    const ids = mutateAsync.mock.calls.map((c) => c[0].clientRequestId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
