import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let preview: any = null;
let ledgerRows: any[] = [];
let currentUser = 'ana';
const ledgerEnabled: boolean[] = [];
const rpc = vi.fn();
const logDiagnostic = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, a?: any) => (a && typeof a === 'object' && a.name ? `${k}:${a.name}` : k),
    i18n: { language: 'hr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: (...a: any[]) => logDiagnostic(...a) }));
vi.mock('@/lib/buildStamp', () => ({ getBuildStamp: () => 'test|assets/index-x.js' }));
vi.mock('@/hooks/useStatusFeedback', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/hooks/useKrugSettlement', async (orig) => ({
  ...(await orig<any>()),
  useKrugSettlement: () => ({ data: preview, isLoading: false, isError: false, error: null }),
}));
vi.mock('@/hooks/useKrug', () => ({ useKrug: () => ({ data: { name: 'K' } }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: currentUser } }) }));
vi.mock('@/hooks/useUserProfiles', () => ({ useUserProfiles: () => new Map() }));
vi.mock('@/lib/krugDisplay', () => ({
  getMemberDisplayName: (_p: unknown, uid: string) => `N_${uid}`,
  getInitials: (_n: string, uid: string) => uid.slice(0, 2),
}));
vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({ customPaymentSources: [{ id: 's1', name: 'Tekući', currency: 'EUR', myRole: 'owner' }], refetch: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: any[]) => rpc(...a), from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: ledgerRows, error: null }) }) }) }) }) },
}));
vi.mock('@/components/krug/KrugSettlementHistory', () => ({
  KrugSettlementHistory: () => <div data-testid="full-history" />,
}));
vi.mock('@/components/krug/KrugSettlementSettings', () => ({ KrugSettlementSettings: () => null }));
vi.mock('@/components/krug/KrugSettleSourceFields', () => ({
  KrugSettleSourceFields: (p: any) => <button data-testid="pick-source" onClick={() => p.onSourceChange('s1')} />,
}));
vi.mock('@/components/krug/KrugConfirmReceiptDialog', () => ({
  KrugConfirmReceiptDialog: (p: any) => <div data-testid="confirm-open">{p.target.ledgerId}</div>,
}));
vi.mock('@/hooks/useKrugSettlementMutations', async (orig) => {
  const real = await orig<any>();
  return {
    ...real,
    useKrugSettlementLedger: (_k: string, enabled: boolean) => {
      ledgerEnabled.push(enabled);
      return { data: enabled ? ledgerRows : [], isLoading: false };
    },
    useLatestKrugFxSnapshot: () => ({ data: null }),
  };
});

import { KrugSettlementSection } from '@/components/krug/KrugSettlementSection';
import * as feedback from '@/hooks/useStatusFeedback';

const renderSection = (props: any) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <KrugSettlementSection krugId="k1" {...props} />
    </QueryClientProvider>,
  );
};

const base = {
  krug_id: 'k1', period_start: '2026-09-01', period_end: '2026-09-30', display_currency: 'EUR', split_mode: 'equal',
  fx: { rates_used: {}, snapshot_date: '2026-09-26', source: 'ecb' },
};

// Real shape of the own-party response (0033): one member (the caller), direct pairs only.
const ownParty = (over: any = {}) => ({
  ...base,
  members: [{ user_id: 'ana', paid: 10, owed: 40, net: -30 }],
  transfers: [
    { from_user: 'ana', to_user: 'ivo', amount: 30, currency: 'EUR' },
    { from_user: 'maja', to_user: 'ana', amount: 12.5, currency: 'EUR' },
  ],
  settled_transfers: [
    { ledger_id: 'L1', from_user: 'maja', to_user: 'ana', amount: 5, currency: 'EUR', marked_at: '2026-09-20T10:00:00Z' },
  ],
  flags: { own_party_view: true, mixed_currencies: false, has_overrides: true },
  ...over,
});

const fullView = {
  ...base,
  members: [
    { user_id: 'ana', paid: 100, owed: 50, net: 50 },
    { user_id: 'ivo', paid: 0, owed: 50, net: -50 },
  ],
  transfers: [{ from_user: 'ivo', to_user: 'ana', amount: 50, currency: 'EUR' }],
  settled_transfers: [],
  flags: { missing_income_data: false, manual_mode_fallback_equal: false, mixed_currencies: false },
};

describe('KrugSettlementSection — regular member (own_party_view)', () => {
  beforeEach(() => {
    currentUser = 'ana'; ledgerEnabled.length = 0; rpc.mockReset(); logDiagnostic.mockReset();
    ledgerRows = [{ id: 'L1', krug_id: 'k1', from_user: 'maja', to_user: 'ana', amount: 5, currency: 'EUR',
      marked_at: '2026-09-20T10:00:00Z', voided_at: null, payer_expense_id: 'e1', recipient_confirmed_at: null }];
  });

  it('shows only own pairs; no other members, totals, FX, export or full history', () => {
    preview = ownParty();
    renderSection({ isFullMember: false, isMember: true });
    expect(screen.getByTestId('krug-own-party-view')).toBeTruthy();
    expect(screen.getByText('krug.settlement.ownParty.notice')).toBeTruthy();
    expect(screen.getByText('N_ivo')).toBeTruthy();
    expect(screen.getByText('N_maja')).toBeTruthy();
    expect(screen.queryByText('N_ana')).toBeNull();
    expect(screen.queryByText('krug.settlement.paid')).toBeNull();
    expect(screen.queryByText('krug.settlement.net')).toBeNull();
    expect(screen.queryByText(/krug.settlement.fxNotice/)).toBeNull();
    expect(screen.queryByLabelText('krug.settlement.pdf.exportButton')).toBeNull();
    expect(screen.queryByTestId('full-history')).toBeNull();
  });

  it('"Podmiri" exists only on the own debt row', () => {
    preview = ownParty();
    renderSection({ isFullMember: false, isMember: true });
    const owe = screen.getAllByTestId('own-party-owe-row');
    const owed = screen.getAllByTestId('own-party-owed-row');
    expect(owe).toHaveLength(1);
    expect(owe[0].querySelector('button')?.textContent).toBe('krug.settlement.markSettled');
    expect(owed[0].querySelector('button')).toBeNull();
    expect(screen.getAllByText('krug.settlement.markSettled')).toHaveLength(1);
  });

  it('history renders exactly what arrived; confirm only when recipient', () => {
    preview = ownParty();
    const { unmount } = renderSection({ isFullMember: false, isMember: true });
    expect(screen.getAllByTestId('own-party-settled-row')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('own-party-confirm'));
    expect(screen.getByTestId('confirm-open').textContent).toBe('L1');
    unmount();

    currentUser = 'maja';
    preview = ownParty({
      members: [{ user_id: 'maja', paid: 0, owed: 0, net: 0 }],
      transfers: [{ from_user: 'maja', to_user: 'ana', amount: 12.5, currency: 'EUR' }],
    });
    renderSection({ isFullMember: false, isMember: true });
    expect(screen.getAllByTestId('own-party-settled-row')).toHaveLength(1);
    expect(screen.queryByTestId('own-party-confirm')).toBeNull();
  });

  it('empty state when nothing is open', () => {
    preview = ownParty({ transfers: [], settled_transfers: [] });
    renderSection({ isFullMember: false, isMember: true });
    expect(screen.getByTestId('krug-own-party-empty').textContent).toBe('krug.settlement.ownParty.empty');
    expect(ledgerEnabled.every((e) => e === false)).toBe(true);
  });

  it('server rejection → translated message + diagnostics row, never the raw error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    preview = ownParty();
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'party_not_full_member' } });
    renderSection({ isFullMember: false, isMember: true });
    fireEvent.click(screen.getByText('krug.settlement.markSettled'));
    fireEvent.click(screen.getByTestId('pick-source'));
    vi.advanceTimersByTime(3500);
    await waitFor(() => expect((screen.getByTestId('settle-confirm') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('settle-confirm'));
    await waitFor(() => expect(logDiagnostic).toHaveBeenCalled());
    expect(rpc.mock.calls[0][0]).toBe('krug_mark_settled_with_source');
    expect(feedback.showError).toHaveBeenCalledWith('krug.settle.error.party_not_full_member');
    const row = logDiagnostic.mock.calls[0][0];
    expect(row.event).toBe('krug_settle_error');
    expect(row.details).toMatchObject({ db_code: 'P0001', db_message: 'party_not_full_member', build: 'test|assets/index-x.js' });
    vi.useRealTimers();
  });
});

describe('KrugSettlementSection — full member / owner unchanged', () => {
  beforeEach(() => { currentUser = 'ivo'; });

  it.each([
    ['full member', { isFullMember: true, isMember: true }],
    ['owner', { isFullMember: true, isMember: true, isOwner: true }],
  ])('%s sees members, transfers, FX, export and history', (_l, props) => {
    preview = fullView;
    renderSection(props);
    expect(screen.queryByTestId('krug-own-party-view')).toBeNull();
    expect(screen.getAllByText('N_ana').length).toBeGreaterThan(0);
    expect(screen.getAllByText('krug.settlement.paid')).toHaveLength(2);
    expect(screen.getByText('krug.settlement.transfers')).toBeTruthy();
    expect(screen.getByText(/krug.settlement.fxNotice/)).toBeTruthy();
    expect(screen.getByLabelText('krug.settlement.pdf.exportButton')).toBeTruthy();
    expect(screen.getByTestId('full-history')).toBeTruthy();
    expect(screen.getAllByText('krug.settlement.markSettled')).toHaveLength(1);
    if ((props as any).isOwner) expect(screen.getByLabelText('krug.settlement.settings.title')).toBeTruthy();
  });

  it('non-member renders nothing', () => {
    preview = fullView;
    const { container } = renderSection({ isFullMember: false, isMember: false });
    expect(container.innerHTML).toBe('');
  });
});
