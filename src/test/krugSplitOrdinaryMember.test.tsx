/**
 * Nalog 3: obični član u prijedlogu podjele — odabir udjela, potvrda/odbijanje
 * običnog člana i zapis greške u dijagnostiku.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let currentUser = 'ana';
let overrideData: any = { active: null, pending: null };
const rpc = vi.fn();
const logDiagnostic = vi.fn();
const showError = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'hr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: (...a: any[]) => logDiagnostic(...a) }));
vi.mock('@/lib/buildStamp', () => ({ getBuildStamp: () => 'test|assets/index-x.js' }));
vi.mock('@/hooks/useStatusFeedback', () => ({ showError: (...a: any[]) => showError(...a), showSuccess: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: currentUser } }) }));
vi.mock('@/hooks/useUserProfiles', () => ({ useUserProfiles: () => new Map() }));
vi.mock('@/lib/krugDisplay', () => ({ getMemberDisplayName: (_p: unknown, uid: string) => `N_${uid}` }));
vi.mock('@/hooks/useKrug', () => ({
  useKrugMembers: () => ({
    data: [
      { user_id: 'ana', kind: 'owner' },
      { user_id: 'ivo', kind: 'punopravni' },
      { user_id: 'maja', kind: 'obicni' },
      { user_id: 'luka', kind: 'obicni' },
    ],
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }));
vi.mock('@/hooks/useKrugExpenseOverride', async (orig) => ({
  ...(await orig<any>()),
  useKrugExpenseOverride: () => ({ data: overrideData, isLoading: false }),
}));

import { KrugExpenseSplitPanelGate } from '@/components/krug/KrugExpenseSplitPanelGate';
import { validateOverrideShares } from '@/hooks/useKrugExpenseOverride';

const renderGate = (allowPropose = true) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <KrugExpenseSplitPanelGate krugId="k1" expenseId="e1" allowPropose={allowPropose} expenseAmount={100} currency="EUR" />
    </QueryClientProvider>,
  );
};

const pendingWithMaja = {
  id: 'o1', expense_id: 'e1', krug_id: 'k1', proposed_by: 'ana', status: 'pending', activated_at: null,
  reject_reason: null, shared_amount: null, created_at: '2026-09-26',
  shares: [{ user_id: 'ana', share_percent: 50 }, { user_id: 'ivo', share_percent: 25 }, { user_id: 'maja', share_percent: 25 }],
  confirmations: [{ user_id: 'ana', confirmed_at: '2026-09-26' }],
};

describe('validateOverrideShares with regular members', () => {
  it('accepts allowed regular members, rejects others', () => {
    const shares = [{ user_id: 'ana', share_percent: 50 }, { user_id: 'ivo', share_percent: 25 }, { user_id: 'maja', share_percent: 25 }];
    expect(validateOverrideShares(shares, ['ana', 'ivo'])).toEqual({ ok: false, error: 'extra_members' });
    expect(validateOverrideShares(shares, ['ana', 'ivo'], ['maja'])).toEqual({ ok: true });
    expect(validateOverrideShares(shares.slice(0, 1).concat(shares.slice(2)), ['ana', 'ivo'], ['maja']))
      .toEqual({ ok: false, error: 'missing_members' });
  });
});

describe('split editor — regular members offered, not included by default', () => {
  beforeEach(() => { currentUser = 'ana'; overrideData = { active: null, pending: null }; rpc.mockReset(); logDiagnostic.mockReset(); showError.mockReset(); });

  it('lists regular members marked and excluded; default submit sends only full members', async () => {
    rpc.mockResolvedValue({ data: { ok: true, auto_activated: false }, error: null });
    renderGate();
    fireEvent.click(screen.getByText('krug.override.actions.propose'));
    expect(screen.getAllByText('krug.override.ordinary.badge')).toHaveLength(2);
    expect(screen.getAllByText('krug.override.ordinary.notIncluded')).toHaveLength(2);
    expect(screen.queryByTestId('share-input-maja')).toBeNull();
    fireEvent.click(screen.getByTestId('override-submit'));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('krug_override_propose');
    expect(args.p_shares.map((s: any) => s.user_id)).toEqual(['ana', 'ivo']);
    expect(args.p_shares.reduce((a: number, s: any) => a + s.share_percent, 0)).toBeCloseTo(100, 2);
  });

  it('including a regular member rebalances and sends his share', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    renderGate();
    fireEvent.click(screen.getByText('krug.override.actions.propose'));
    fireEvent.click(screen.getByLabelText('krug.override.ordinary.include N_maja'));
    expect(screen.getByTestId('share-input-maja')).toBeTruthy();
    fireEvent.click(screen.getByTestId('override-submit'));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const shares = rpc.mock.calls[0][1].p_shares;
    expect(shares.map((s: any) => s.user_id)).toEqual(['ana', 'ivo', 'maja']);
    expect(shares.reduce((a: number, s: any) => a + s.share_percent, 0)).toBeCloseTo(100, 2);
  });

  it('server rejection → translated message', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'shares_user_not_member' } });
    renderGate();
    fireEvent.click(screen.getByText('krug.override.actions.propose'));
    fireEvent.click(screen.getByLabelText('krug.override.ordinary.include N_maja'));
    fireEvent.click(screen.getByTestId('override-submit'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('krug.override.error.shares_user_not_member'));
    expect(logDiagnostic.mock.calls[0][0]).toMatchObject({
      event: 'krug_override_propose_error',
      details: { db_code: '22023', db_message: 'shares_user_not_member', build: 'test|assets/index-x.js' },
    });
  });
});

describe('regular member in a proposal', () => {
  beforeEach(() => { rpc.mockReset(); logDiagnostic.mockReset(); showError.mockReset(); });

  it('included regular member can confirm or reject, never propose; awaiting counts him', () => {
    currentUser = 'maja';
    overrideData = { active: null, pending: pendingWithMaja };
    renderGate(true);
    expect(screen.getByText('krug.override.actions.confirm')).toBeTruthy();
    expect(screen.getByText('krug.override.actions.reject')).toBeTruthy();
    expect(screen.queryByText('krug.override.actions.propose')).toBeNull();
    expect(screen.queryByText('krug.override.actions.propose_new')).toBeNull();
  });

  it('regular member without a share sees nothing', () => {
    currentUser = 'luka';
    overrideData = { active: null, pending: pendingWithMaja };
    const { container } = renderGate(true);
    expect(container.textContent).toBe('');
  });

  it('confirm failure → translated message + diagnostics row', async () => {
    currentUser = 'maja';
    overrideData = { active: null, pending: pendingWithMaja };
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'not_pending' } });
    renderGate(false);
    fireEvent.click(screen.getByText('krug.override.actions.confirm'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('krug.override.error.not_pending'));
    expect(logDiagnostic.mock.calls[0][0]).toMatchObject({
      event: 'krug_override_action_error',
      details: { rpc: 'krug_override_confirm', db_code: '22023', db_message: 'not_pending', build: 'test|assets/index-x.js', override_id: 'o1' },
    });
  });
});
