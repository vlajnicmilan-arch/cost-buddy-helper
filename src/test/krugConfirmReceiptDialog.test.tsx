import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mutateAsync = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/hooks/useBackButton', () => ({ useBackButton: () => {} }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/hooks/useKrugSettlementMutations', () => ({
  useKrugConfirmSettlementReceipt: () => ({ mutateAsync, isPending: false }),
  useLatestKrugFxSnapshot: () => ({ data: null }),
}));
vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({
    customPaymentSources: [
      { id: 'zaba', name: 'Zaba', currency: 'EUR', myRole: 'owner' },
      { id: 'usd', name: 'USD', currency: 'USD', myRole: 'full' },
      { id: 'view', name: 'View', currency: 'EUR', myRole: 'viewer' },
    ],
    refetch: vi.fn(),
  }),
}));
vi.mock('@/components/krug/KrugSettleSourceFields', () => ({
  KrugSettleSourceFields: (p: any) => (
    <div>
      <span>{p.sourceLabelKey}</span>
      {p.sources.map((s: any) => (
        <button key={s.id} onClick={() => p.onSourceChange(s.id)}>pick-{s.id}</button>
      ))}
      {p.showPayerAmount && (
        <input aria-label="received" value={p.payerAmount} onChange={(e) => p.onPayerAmountChange(e.target.value)} />
      )}
    </div>
  ),
}));

import { KrugConfirmReceiptDialog } from '@/components/krug/KrugConfirmReceiptDialog';

const target = { ledgerId: 'L1', amount: 20, currency: 'EUR', fromName: 'Petar' };

describe('KrugConfirmReceiptDialog', () => {
  beforeEach(() => mutateAsync.mockClear());

  it('uses recipient labels, hides viewer sources, does not send without a source', () => {
    render(<KrugConfirmReceiptDialog krugId="k" target={target} onOpenChange={() => {}} />);
    expect(screen.getByText('krug.settle.confirm.sourceLabel')).toBeTruthy();
    expect(screen.queryByText('pick-view')).toBeNull();
    fireEvent.click(screen.getByTestId('receipt-confirm'));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('different currency requires the received amount', async () => {
    render(<KrugConfirmReceiptDialog krugId="k" target={target} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText('pick-usd'));
    expect(screen.getByTestId('receipt-confirm')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('received'), { target: { value: '22.75' } });
    await act(async () => { fireEvent.click(screen.getByTestId('receipt-confirm')); });
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      ledgerId: 'L1', recipientSourceId: 'usd', recipientAmount: 22.75,
    }));
  });

  it('one client_request_id per opening (double click + retry), new one on reopen', async () => {
    let resolve!: (v: unknown) => void;
    mutateAsync.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const { rerender } = render(<KrugConfirmReceiptDialog krugId="k" target={target} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText('pick-zaba'));
    const btn = screen.getByTestId('receipt-confirm');
    await act(async () => { fireEvent.click(btn); fireEvent.click(btn); });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ok: true }); });
    await act(async () => { fireEvent.click(btn); });
    expect(new Set(mutateAsync.mock.calls.map((c) => c[0].clientRequestId)).size).toBe(1);
    rerender(<KrugConfirmReceiptDialog krugId="k" target={null} onOpenChange={() => {}} />);
    rerender(<KrugConfirmReceiptDialog krugId="k" target={target} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText('pick-zaba'));
    await act(async () => { fireEvent.click(screen.getByTestId('receipt-confirm')); });
    const ids = mutateAsync.mock.calls.map((c) => c[0].clientRequestId);
    expect(ids[2]).not.toBe(ids[0]);
  });
});
