import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const voidMutate = vi.fn().mockResolvedValue({});
let rows: any[] = [];
let currentUser = 'milan';
vi.mock('@/hooks/useBackButton', () => ({ useBackButton: () => {} }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/hooks/useKrugSettlementMutations', () => ({
  useKrugSettlementLedger: () => ({ data: rows, isLoading: false }),
  useKrugVoidSettlement: () => ({ mutateAsync: voidMutate, isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: currentUser } }) }));
vi.mock('@/hooks/useUserProfiles', () => ({ useUserProfiles: () => new Map() }));
vi.mock('@/hooks/useAllPaymentSourceNames', () => ({ useAllPaymentSourceNames: () => [{ id: 'zaba', name: 'Zaba' }] }));
vi.mock('@/lib/krugDisplay', () => ({ getMemberDisplayName: (_p: unknown, uid: string) => uid }));
vi.mock('@/components/common/CollapsibleSection', () => ({ CollapsibleSection: (p: any) => <div>{p.children}</div> }));
vi.mock('@/components/krug/KrugConfirmReceiptDialog', () => ({
  KrugConfirmReceiptDialog: (p: any) => (p.target ? <div data-testid="confirm-open">{p.target.ledgerId}</div> : null),
}));

import { KrugSettlementHistory } from '@/components/krug/KrugSettlementHistory';

const pending = {
  id: 'L1', krug_id: 'k', from_user: 'petar', to_user: 'milan', amount: 20, currency: 'EUR',
  note: null, marked_by: 'petar', marked_at: '2026-09-24T10:00:00Z', voided_at: null, voided_by: null,
  void_reason: null, payer_expense_id: 'e1', payer_source_id: 'rev', recipient_confirmed_at: null,
};

describe('KrugSettlementHistory — recipient side', () => {
  beforeEach(() => { voidMutate.mockClear(); currentUser = 'milan'; });

  it('recipient sees confirm + not received while awaiting', () => {
    rows = [pending];
    render(<KrugSettlementHistory krugId="k" isFullMember />);
    expect(screen.getByTestId('settle-recipient-actions')).toBeTruthy();
  });

  it('debtor sees only the awaiting status', () => {
    rows = [pending]; currentUser = 'petar';
    render(<KrugSettlementHistory krugId="k" isFullMember />);
    expect(screen.queryByTestId('settle-recipient-actions')).toBeNull();
    expect(screen.getByTestId('settle-awaiting-receipt')).toBeTruthy();
  });

  it('no actions after confirmation (shows received on) and none for legacy rows', () => {
    rows = [
      { ...pending, recipient_confirmed_at: '2026-09-24T11:00:00Z', recipient_source_id: 'zaba' },
      { ...pending, id: 'L2', payer_expense_id: null, payer_source_id: null },
    ];
    render(<KrugSettlementHistory krugId="k" isFullMember />);
    expect(screen.queryByTestId('settle-recipient-actions')).toBeNull();
    expect(screen.getByText('krug.settle.history.receivedOn')).toBeTruthy();
  });

  it('"Nisam primio" opens the existing void dialog with the pre-filled reason', () => {
    rows = [pending];
    render(<KrugSettlementHistory krugId="k" isFullMember />);
    fireEvent.click(screen.getByText('krug.settle.history.notReceived'));
    expect((screen.getByLabelText('krug.settle.history.voidDialog.reasonLabel') as HTMLInputElement).value)
      .toBe('krug.settle.history.notReceivedReason');
  });

  it('deep link with confirm opens the confirm dialog for that row (recipient only)', () => {
    rows = [pending];
    render(<KrugSettlementHistory krugId="k" isFullMember focusSettlementId="L1" focusConfirmReceipt />);
    expect(screen.getByTestId('confirm-open').textContent).toBe('L1');
  });

  it('deep link does not open confirm for the debtor', () => {
    rows = [pending]; currentUser = 'petar';
    render(<KrugSettlementHistory krugId="k" isFullMember focusSettlementId="L1" focusConfirmReceipt />);
    expect(screen.queryByTestId('confirm-open')).toBeNull();
  });
});
