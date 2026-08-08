/**
 * A2 (odbijanje) traži OBAVEZAN razlog.
 *
 * Regresija: klik na "Odbij" ne smije odmah pozvati RPC — mora otvoriti
 * aplikacijski dijalog s poljem za razlog. Potvrda je onemogućena dok je
 * polje prazno, a kad se razlog upiše, ide u `mutateAsync` kao `reason`.
 * A1 (potvrda) ostaje jedan klik.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  mutateAsync: vi.fn().mockResolvedValue({ act: 'A2', result: { outcome: 'ok_negated' } }),
  pending: [
    {
      id: 'exp-1',
      user_id: 'author-1',
      amount: 100,
      currency: 'EUR',
      date: new Date('2026-08-08T10:00:00Z'),
      description: 'Zajednička večera',
      merchant_name: null,
    },
  ],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'hr' },
  }),
}));

vi.mock('@/hooks/useKrugPendingExpenses', () => ({
  useKrugPendingExpenses: () => ({ data: hoisted.pending, isLoading: false }),
}));

vi.mock('@/hooks/useKrugAct', () => ({
  useKrugApplyAct: () => ({ mutateAsync: hoisted.mutateAsync, isPending: false }),
}));

vi.mock('@/hooks/useModuleGate', () => ({
  useModuleGate: () => ({
    requestModule: (_m: string, options?: { onGranted?: () => void }) => options?.onGranted?.(),
  }),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `${n} €` }),
}));

vi.mock('@/hooks/useUserProfiles', () => ({
  useUserProfiles: () => new Map(),
}));

vi.mock('@/hooks/useBackButton', () => ({
  useBackButton: () => {},
}));

vi.mock('@/components/TransactionDetailDialog', () => ({
  TransactionDetailDialog: () => null,
}));

import { KrugApprovalQueue } from './KrugApprovalQueue';

describe('KrugApprovalQueue — obavezan razlog pri odbijanju', () => {
  beforeEach(() => {
    hoisted.mutateAsync.mockClear();
  });

  const renderQueue = () =>
    render(
      <KrugApprovalQueue krugId="k1" viewerUserId="viewer-1" viewerIsFullMember />,
    );

  it('klik na Odbij ne šalje RPC odmah, nego otvara dijalog s razlogom', async () => {
    renderQueue();
    fireEvent.click(screen.getByRole('button', { name: 'Odbij' }));
    expect(hoisted.mutateAsync).not.toHaveBeenCalled();
    await screen.findByLabelText('Razlog odbijanja');
    const confirm = screen.getByRole('button', { name: 'Odbij trošak' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it('šalje upisani razlog u krug_apply_act', async () => {
    renderQueue();
    fireEvent.click(screen.getByRole('button', { name: 'Odbij' }));
    const input = await screen.findByLabelText('Razlog odbijanja');
    fireEvent.change(input, { target: { value: 'nije zajednički trošak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Odbij trošak' }));
    await waitFor(() =>
      expect(hoisted.mutateAsync).toHaveBeenCalledWith({
        expenseId: 'exp-1',
        act: 'A2',
        reason: 'nije zajednički trošak',
      }),
    );
  });

  it('A1 ostaje jedan klik, bez razloga', async () => {
    renderQueue();
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi' }));
    await waitFor(() =>
      expect(hoisted.mutateAsync).toHaveBeenCalledWith({
        expenseId: 'exp-1',
        act: 'A1',
        reason: undefined,
      }),
    );
  });
});
