/**
 * correctionDeleteGuard — pub/sub + error class tests.
 *
 * Ne poziva Supabase (telemetrija je best-effort i pukne tiho); test se
 * fokusira na promise-based confirm flow i CorrectionInBulkError.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CorrectionInBulkError,
  isCorrectionInBulkError,
  confirmCorrectionDelete,
  _resolveCurrentCorrectionDelete,
  subscribeCorrectionDeleteRequests,
} from '../correctionDeleteGuard';

// Silence supabase telemetry side-effect during tests.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

describe('CorrectionInBulkError', () => {
  it('is detected by isCorrectionInBulkError', () => {
    const e = new CorrectionInBulkError('exp-1');
    expect(isCorrectionInBulkError(e)).toBe(true);
    expect(e.expenseId).toBe('exp-1');
    expect(e.code).toBe('correction_in_bulk');
  });

  it('accepts plain object with matching code (cross-realm)', () => {
    expect(isCorrectionInBulkError({ code: 'correction_in_bulk' })).toBe(true);
    expect(isCorrectionInBulkError(new Error('other'))).toBe(false);
  });
});

describe('confirmCorrectionDelete pub/sub', () => {
  it('resolves true when host confirms', async () => {
    const seen: (unknown)[] = [];
    const unsub = subscribeCorrectionDeleteRequests((r) => seen.push(r));
    const p = confirmCorrectionDelete({ expenseId: 'e1', description: 'x', amount: 10 });
    expect(seen[seen.length - 1]).toMatchObject({ expenseId: 'e1' });
    _resolveCurrentCorrectionDelete(true);
    await expect(p).resolves.toBe(true);
    unsub();
  });

  it('resolves false when host cancels', async () => {
    const p = confirmCorrectionDelete({ expenseId: 'e2', description: null, amount: null });
    _resolveCurrentCorrectionDelete(false);
    await expect(p).resolves.toBe(false);
  });

  it('cancels previous pending request when a new one arrives', async () => {
    const first = confirmCorrectionDelete({ expenseId: 'e3', description: null, amount: null });
    const second = confirmCorrectionDelete({ expenseId: 'e4', description: null, amount: null });
    await expect(first).resolves.toBe(false); // pre-empted
    _resolveCurrentCorrectionDelete(true);
    await expect(second).resolves.toBe(true);
  });
});
