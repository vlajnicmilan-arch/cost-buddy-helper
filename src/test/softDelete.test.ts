import { describe, it, expect } from 'vitest';
import { reapplyExpenseBalance } from '@/lib/softDelete';

// Balance recompute for custom payment sources is now handled by the database
// trigger `trg_expenses_recompute_source_balance` (anchor-based model).
// `reapplyExpenseBalance` is intentionally a no-op on cloud — the trigger fires
// when restore RPC updates the expenses row.
describe('softDelete → reapplyExpenseBalance (no-op after trigger migration)', () => {
  it('returns without throwing for any expense shape', async () => {
    await expect(
      reapplyExpenseBalance({ type: 'expense', amount: 50, payment_source: 'custom:11111111-1111-1111-1111-111111111111' })
    ).resolves.toBeUndefined();
    await expect(
      reapplyExpenseBalance({ type: 'income', amount: 75, payment_source: '11111111-1111-1111-1111-111111111111' })
    ).resolves.toBeUndefined();
    await expect(
      reapplyExpenseBalance({
        type: 'transfer',
        amount: 120,
        payment_source: '11111111-1111-1111-1111-111111111111',
        income_source_id: '22222222-2222-2222-2222-222222222222',
      })
    ).resolves.toBeUndefined();
  });
});
