/**
 * useFreeLimits — read-only projekcija stanja Free razine.
 *
 * Jedina brojčana kvota ovog hooka je server-side brojač od 30 transakcija
 * mjesečno. Novčanici i proračuni nemaju brojčanu free kvotu.
 */
import { useMemo } from 'react';
import { useFeatureAccess, FREE_LIMITS } from '@/hooks/useFeatureAccess';
import { useFreeTierUsage } from '@/hooks/useFreeTierUsage';
import { Expense } from '@/types/expense';
import { startOfMonth, endOfMonth } from 'date-fns';

interface FreeLimitsResult {
  canAddTransaction: boolean;
  transactionsThisMonth: number;
  transactionLimit: number;
  isLimited: boolean;
}

export function useFreeLimits(
  expenses: Expense[],
  paymentSourceCount: number,
  budgetCount: number,
): FreeLimitsResult {
  const { hasAccess } = useFeatureAccess();
  const { usage } = useFreeTierUsage();
  const isLimited = !hasAccess('unlimited_transactions');

  const transactionsThisMonth = useMemo(() => {
    if (!isLimited) return 0;
    // Preferiraj server counter (increment-only); fallback = klijentska heuristika
    if (usage) return usage.transactions_created;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= monthStart && d <= monthEnd;
    }).length;
  }, [expenses, isLimited, usage]);

  return {
    canAddTransaction: !isLimited || transactionsThisMonth < FREE_LIMITS.transactions_per_month,
    transactionsThisMonth,
    transactionLimit: FREE_LIMITS.transactions_per_month,
    isLimited,
  };
}
