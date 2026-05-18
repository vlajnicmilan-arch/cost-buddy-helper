import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reapplyExpenseBalance } from '@/lib/softDelete';

// Mock supabase client – tracks UPDATE calls na custom_payment_sources
const balances = new Map<string, number>();

vi.mock('@/integrations/supabase/client', () => {
  const supabase = {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (table !== 'custom_payment_sources') return { data: null };
            const bal = balances.get(val);
            return bal === undefined ? { data: null } : { data: { id: val, balance: bal } };
          },
        }),
      }),
      update: (patch: { balance: number }) => ({
        eq: async (_col: string, val: string) => {
          if (table === 'custom_payment_sources') balances.set(val, patch.balance);
          return { error: null };
        },
      }),
    }),
  };
  return { supabase };
});

const SRC_A = '11111111-1111-1111-1111-111111111111';
const SRC_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  balances.clear();
});

describe('softDelete → reapplyExpenseBalance round-trip', () => {
  it('expense: reapplying restores the subtracted balance', async () => {
    balances.set(SRC_A, 100);
    // Simuliraj soft-delete koji je inverirao -50 (balance je vraćen na 150)
    balances.set(SRC_A, 150);
    // Restore: ponovno oduzima 50
    await reapplyExpenseBalance({ type: 'expense', amount: 50, payment_source: SRC_A });
    expect(balances.get(SRC_A)).toBe(100);
  });

  it('income: reapplying adds the amount back', async () => {
    balances.set(SRC_A, 200);
    await reapplyExpenseBalance({ type: 'income', amount: 75, payment_source: SRC_A });
    expect(balances.get(SRC_A)).toBe(275);
  });

  it('transfer: debits source and credits destination', async () => {
    balances.set(SRC_A, 500);
    balances.set(SRC_B, 100);
    await reapplyExpenseBalance({
      type: 'transfer',
      amount: 120,
      payment_source: SRC_A,
      income_source_id: SRC_B,
    });
    expect(balances.get(SRC_A)).toBe(380);
    expect(balances.get(SRC_B)).toBe(220);
  });

  it('ignores non-UUID payment_source (legacy "cash" etc.)', async () => {
    balances.set(SRC_A, 100);
    await reapplyExpenseBalance({ type: 'expense', amount: 50, payment_source: 'cash' });
    expect(balances.get(SRC_A)).toBe(100);
  });

  it('strips "custom:" prefix', async () => {
    balances.set(SRC_A, 100);
    await reapplyExpenseBalance({ type: 'expense', amount: 30, payment_source: `custom:${SRC_A}` });
    expect(balances.get(SRC_A)).toBe(70);
  });
});
