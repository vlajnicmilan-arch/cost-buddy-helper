import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const invoke = vi.fn(() => Promise.resolve({ data: null, error: null }));
const rpc = vi.fn((fn: string) =>
  Promise.resolve({
    data: fn === 'create_worker_payout' ? { payout_id: 'p1' } : fn === 'create_worker_payout_batch' ? { batch_id: 'b1' } : null,
    error: null,
  }),
);
const chain: Record<string, unknown> = {};
for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) chain[m] = () => chain;
chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke }, rpc, from: () => chain },
}));
vi.mock('@/hooks/useStatusFeedback', () => ({
  showSuccess: vi.fn(), showError: vi.fn(),
}));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { useWorkerPayouts } from '../useWorkerPayouts';
import { usePersonPayoutVoid } from '../usePersonPayoutVoid';

describe('worker payout push is server-side only', () => {
  beforeEach(() => { invoke.mockClear(); rpc.mockClear(); });

  it('useWorkerPayouts never invokes notify-worker-payout', async () => {
    const { result } = renderHook(() => useWorkerPayouts({ projectId: 'proj' } as never));
    await act(async () => {
      await result.current.createPayout({
        workerId: 'w', projectId: 'proj', periodStart: '2026-01-01', periodEnd: '2026-01-31',
        paidAmount: 1, paymentSource: 'cash', paidAt: '2026-01-31T00:00:00Z', note: null, lockEntries: false,
      } as never);
      await result.current.voidPayout('p1');
    });
    expect(rpc).toHaveBeenCalledWith('create_worker_payout', expect.anything());
    expect(invoke).not.toHaveBeenCalledWith('notify-worker-payout', expect.anything());
  });

  it('usePersonPayoutVoid never invokes notify-worker-payout', async () => {
    const { result } = renderHook(() => usePersonPayoutVoid());
    await act(async () => {
      await result.current.voidPayout({ payoutId: 'p1', batchId: null, reason: 'x' } as never);
    });
    expect(rpc).toHaveBeenCalledWith('void_worker_payout', expect.anything());
    expect(invoke).not.toHaveBeenCalledWith('notify-worker-payout', expect.anything());
  });
});
