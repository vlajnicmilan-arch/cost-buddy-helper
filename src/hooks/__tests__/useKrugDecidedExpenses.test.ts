/**
 * useKrugDecidedExpenses — dokaz filter shape-a i invalidation surface.
 *
 * Cilj:
 *   1. hook dovlači SAMO decided shared redove za točan krug_id
 *      (privacy='shared', status IN potvrdjena/nepotvrdjena, deleted_at IS NULL,
 *      order updated_at desc, limit 10);
 *   2. `predlozena` NIKAD ne curi u decided path;
 *   3. uspješan A1/A2 invalidira i decided queryKey, ne samo pending.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const hoisted = vi.hoisted(() => ({
  builder: null as any,
  captured: {
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
    is: [] as Array<[string, unknown]>,
    order: [] as Array<[string, unknown]>,
    limit: null as number | null,
    from: null as string | null,
  },
  rpc: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

function resetCapture() {
  hoisted.captured = {
    eq: [],
    in: [],
    is: [],
    order: [],
    limit: null,
    from: null,
  };
}

function makeBuilder(rows: any[]) {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn((col: string, val: unknown) => {
      hoisted.captured.eq.push([col, val]);
      return b;
    }),
    in: vi.fn((col: string, vals: unknown[]) => {
      hoisted.captured.in.push([col, vals]);
      return b;
    }),
    is: vi.fn((col: string, val: unknown) => {
      hoisted.captured.is.push([col, val]);
      return b;
    }),
    order: vi.fn((col: string, opts: unknown) => {
      hoisted.captured.order.push([col, opts]);
      return b;
    }),
    limit: vi.fn((n: number) => {
      hoisted.captured.limit = n;
      return Promise.resolve({ data: rows, error: null });
    }),
  };
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      hoisted.captured.from = table;
      return hoisted.builder;
    },
    rpc: (...args: any[]) => hoisted.rpc(...args),
  },
}));

vi.mock('@/hooks/useStatusFeedback', () => ({
  showSuccess: (m?: string) => hoisted.showSuccess(m),
  showError: (m?: string) => hoisted.showError(m),
}));

vi.mock('@/i18n', () => ({
  default: { t: (_k: string, f?: string) => f ?? _k },
}));

import { useKrugDecidedExpenses } from '@/hooks/useKrugDecidedExpenses';
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
  resetCapture();
  hoisted.rpc.mockReset();
  hoisted.showSuccess.mockReset();
  hoisted.showError.mockReset();
  hoisted.builder = makeBuilder([]);
});

describe('useKrugDecidedExpenses — filter shape', () => {
  it('queries expenses with krug_id, shared, potvrdjena|nepotvrdjena, deleted_at IS NULL, order updated_at desc, limit 10', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKrugDecidedExpenses('krug-x'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(hoisted.captured.from).toBe('expenses');

    const eqMap = new Map(hoisted.captured.eq);
    expect(eqMap.get('krug_id')).toBe('krug-x');
    expect(eqMap.get('krug_privacy')).toBe('shared');

    // `predlozena` NE smije završiti u equality — mora ići kroz `.in`.
    expect(Array.from(eqMap.values())).not.toContain('predlozena');

    const inMap = new Map(hoisted.captured.in);
    const statuses = inMap.get('krug_shared_status') as string[] | undefined;
    expect(statuses).toBeDefined();
    expect(new Set(statuses)).toEqual(new Set(['potvrdjena', 'nepotvrdjena']));
    expect(statuses).not.toContain('predlozena');

    const isMap = new Map(hoisted.captured.is);
    expect(isMap.get('deleted_at')).toBeNull();

    expect(hoisted.captured.order[0][0]).toBe('updated_at');
    expect((hoisted.captured.order[0][1] as any).ascending).toBe(false);

    expect(hoisted.captured.limit).toBe(10);
  });

  it('is disabled without krugId (no supabase call)', async () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useKrugDecidedExpenses(null), { wrapper });
    // Bez enabled=true, queryFn se nikad ne zove.
    expect(hoisted.captured.from).toBeNull();
  });
});

describe('useKrugApplyAct — decided surface invalidation', () => {
  it('A1 success invalidates decided-expenses queryKey', async () => {
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
        ['krug', 'decided-expenses'],
      ]),
    );
  });

  it('A2 success invalidates decided-expenses queryKey', async () => {
    hoisted.rpc.mockResolvedValueOnce({
      data: { outcome: 'ok_negated', expense_id: 'e1' },
      error: null,
    });
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useKrugApplyAct(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ expenseId: 'e1', act: 'A2' });
    });

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as any)?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([['krug', 'decided-expenses']]));
  });
});
