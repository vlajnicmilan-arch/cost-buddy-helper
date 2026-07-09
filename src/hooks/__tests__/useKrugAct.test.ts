/**
 * WS-Approval-Fix v1 — runtime dokaz da:
 *   1. uspješan A1/A2 invalidira i Krug pending queue (`['krug','pending-expenses']`),
 *      ne samo `['expenses']`,
 *   2. A1 uspjeh javlja specifičnu poruku (Trošak je potvrđen),
 *   3. A2 uspjeh javlja specifičnu poruku (Trošak je odbijen),
 *   4. non-OK outcome (npr. `wrong_state`) NE prosljeđuje sirovi enum
 *      korisniku — koristi lokaliziranu poruku iz i18n mapiranja.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const hoisted = vi.hoisted(() => ({
  rpc: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: any[]) => hoisted.rpc(...args) },
}));

vi.mock('@/hooks/useStatusFeedback', () => ({
  showSuccess: (m?: string) => hoisted.showSuccess(m),
  showError: (m?: string) => hoisted.showError(m),
}));

vi.mock('@/i18n', () => ({
  default: {
    t: (_key: string, fallback?: string) => fallback ?? _key,
  },
}));

import { useKrugApplyAct } from '@/hooks/useKrugAct';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { wrapper, qc, invalidateSpy };
}

beforeEach(() => {
  hoisted.rpc.mockReset();
  hoisted.showSuccess.mockReset();
  hoisted.showError.mockReset();
});

describe('useKrugApplyAct — WS-Approval-Fix v1', () => {
  it('A1 success: invalidates both expenses AND krug pending queue', async () => {
    hoisted.rpc.mockResolvedValueOnce({
      data: { outcome: 'ok_confirmed', expense_id: 'e1' },
      error: null,
    });
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useKrugApplyAct(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ expenseId: 'e1', act: 'A1' });
    });

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as any)?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ['expenses'],
        ['krug', 'pending-expenses'],
      ]),
    );
  });

  it('A1 success: specific success message (not generic)', async () => {
    hoisted.rpc.mockResolvedValueOnce({
      data: { outcome: 'ok_confirmed', expense_id: 'e1' },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKrugApplyAct(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ expenseId: 'e1', act: 'A1' });
    });

    await waitFor(() => expect(hoisted.showSuccess).toHaveBeenCalledTimes(1));
    const msg = hoisted.showSuccess.mock.calls[0][0] as string;
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/potvr/i); // HR fallback "Trošak je potvrđen."
    expect(hoisted.showError).not.toHaveBeenCalled();
  });

  it('A2 success: specific success message distinct from A1', async () => {
    hoisted.rpc.mockResolvedValueOnce({
      data: { outcome: 'ok_negated', expense_id: 'e1' },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKrugApplyAct(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ expenseId: 'e1', act: 'A2' });
    });

    await waitFor(() => expect(hoisted.showSuccess).toHaveBeenCalledTimes(1));
    const msg = hoisted.showSuccess.mock.calls[0][0] as string;
    expect(msg).toMatch(/odbij/i); // HR fallback "Trošak je odbijen."
    expect(hoisted.showError).not.toHaveBeenCalled();
  });

  it('non-OK outcome (wrong_state): shows mapped text, never raw enum', async () => {
    hoisted.rpc.mockResolvedValueOnce({
      data: { outcome: 'wrong_state', expense_id: 'e1' },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKrugApplyAct(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ expenseId: 'e1', act: 'A1' });
    });

    await waitFor(() => expect(hoisted.showError).toHaveBeenCalledTimes(1));
    const msg = hoisted.showError.mock.calls[0][0] as string;
    // Sirovi enum NIKAD ne smije završiti u korisničkoj poruci.
    expect(msg).not.toBe('wrong_state');
    expect(msg).not.toMatch(/^[a-z_]+$/); // enum-shaped bez razmaka = fail
    expect(msg).toMatch(/./); // non-empty
    expect(hoisted.showSuccess).not.toHaveBeenCalled();
  });

  it('non-OK outcome (not_full_member): mapped text, not raw enum', async () => {
    hoisted.rpc.mockResolvedValueOnce({
      data: { outcome: 'not_full_member', expense_id: 'e1' },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKrugApplyAct(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ expenseId: 'e1', act: 'A1' });
    });

    await waitFor(() => expect(hoisted.showError).toHaveBeenCalledTimes(1));
    const msg = hoisted.showError.mock.calls[0][0] as string;
    expect(msg).not.toBe('not_full_member');
    expect(msg).not.toMatch(/^[a-z_]+$/);
  });
});
