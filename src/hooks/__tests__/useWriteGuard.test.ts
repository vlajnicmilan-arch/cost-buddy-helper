/**
 * Regresija — useWriteGuard: potvrđuje da klijentska logika odgovara
 * Milanovoj Read-Only politici (module-block, free-limit, delete-ne-oslobađa).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Mocks --------------------------------------------------------------
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string | Record<string, unknown>) => (typeof d === 'string' ? d : _k) }),
}));

const mockAccess = { hasAccess: vi.fn(), isFreeTier: true };
vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => mockAccess,
  FREE_LIMITS: { transactions_per_month: 30, payment_sources: 1, budgets: 1 },
}));

const mockUsage = { usage: { transactions_created: 0, month_key: '2026-08' } };
vi.mock('@/hooks/useFreeTierUsage', () => ({
  useFreeTierUsage: () => mockUsage,
}));

import { useWriteGuard } from '@/hooks/useWriteGuard';

beforeEach(() => {
  toastError.mockReset();
  mockAccess.hasAccess.mockReset();
  mockUsage.usage = { transactions_created: 0, month_key: '2026-08' };
});

describe('useWriteGuard', () => {
  it('module bez entitlementa → blokira i toasta', async () => {
    mockAccess.hasAccess.mockReturnValue(false);
    const { result } = renderHook(() => useWriteGuard({ kind: 'module', feature: 'krug' }));
    expect(result.current.canWrite).toBe(false);
    const action = vi.fn().mockReturnValue('ok');
    let out: unknown;
    await act(async () => { out = await result.current.guard(action); });
    expect(action).not.toHaveBeenCalled();
    expect(out).toBeUndefined();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('module s entitlementom → propušta action', async () => {
    mockAccess.hasAccess.mockReturnValue(true);
    const { result } = renderHook(() => useWriteGuard({ kind: 'module', feature: 'krug' }));
    expect(result.current.canWrite).toBe(true);
    const action = vi.fn().mockResolvedValue(42);
    let out: unknown;
    await act(async () => { out = await result.current.guard(action); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(out).toBe(42);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('free tx limit dosegnut (server counter) → blokira i kad je expenses[] prazan', async () => {
    // Simulira scenarij: user je unio 30, obrisao 10 (klijentski expenses.length=20),
    // ali server counter i dalje 30 → mora blokirati.
    mockAccess.hasAccess.mockImplementation((f: string) => f === 'krug'); // nema unlimited_transactions
    mockUsage.usage = { transactions_created: 30, month_key: '2026-08' };
    const { result } = renderHook(() => useWriteGuard({ kind: 'freeTx' }));
    expect(result.current.canWrite).toBe(false);
    const action = vi.fn();
    await act(async () => { await result.current.guard(action); });
    expect(action).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('free tx ispod limita → propušta', async () => {
    mockAccess.hasAccess.mockReturnValue(false);
    mockUsage.usage = { transactions_created: 5, month_key: '2026-08' };
    const { result } = renderHook(() => useWriteGuard({ kind: 'freeTx' }));
    expect(result.current.canWrite).toBe(true);
  });

  it('unlimited_transactions entitlement → nema limita', async () => {
    mockAccess.hasAccess.mockImplementation((f: string) => f === 'unlimited_transactions');
    mockUsage.usage = { transactions_created: 999, month_key: '2026-08' };
    const { result } = renderHook(() => useWriteGuard({ kind: 'freeTx' }));
    expect(result.current.canWrite).toBe(true);
  });

  it('serverska greška "free_limit_exceeded" → user-friendly toast bez re-throwa', async () => {
    mockAccess.hasAccess.mockReturnValue(true);
    const { result } = renderHook(() => useWriteGuard({ kind: 'module', feature: 'krug' }));
    const action = vi.fn().mockRejectedValue(new Error('free_limit_exceeded: transactions 30/30'));
    let out: unknown;
    await act(async () => { out = await result.current.guard(action); });
    expect(out).toBeUndefined();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('freePaymentSource limit dosegnut → blokira', () => {
    mockAccess.hasAccess.mockReturnValue(false);
    const { result } = renderHook(() =>
      useWriteGuard({ kind: 'freePaymentSource', currentCount: 1 })
    );
    expect(result.current.canWrite).toBe(false);
  });

  it('freeBudget limit dosegnut → blokira', () => {
    mockAccess.hasAccess.mockReturnValue(false);
    const { result } = renderHook(() =>
      useWriteGuard({ kind: 'freeBudget', currentCount: 1 })
    );
    expect(result.current.canWrite).toBe(false);
  });
});
