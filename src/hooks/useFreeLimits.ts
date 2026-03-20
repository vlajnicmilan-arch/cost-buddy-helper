import { useMemo } from 'react';
import { useFeatureAccess, FREE_LIMITS } from '@/hooks/useFeatureAccess';
import { Expense } from '@/types/expense';
import { startOfMonth, endOfMonth } from 'date-fns';

interface FreeLimitsResult {
  canAddTransaction: boolean;
  canAddPaymentSource: boolean;
  canAddBudget: boolean;
  transactionsThisMonth: number;
  transactionLimit: number;
  paymentSourceCount: number;
  paymentSourceLimit: number;
  budgetCount: number;
  budgetLimit: number;
  isLimited: boolean;
}

export function useFreeLimits(
  expenses: Expense[],
  paymentSourceCount: number,
  budgetCount: number,
): FreeLimitsResult {
  const { hasAccess } = useFeatureAccess();

  const transactionsThisMonth = useMemo(() => {
    if (hasAccess('unlimited_transactions')) return 0;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return expenses.filter(e => {
      const d = new Date(e.date);
      return d >= monthStart && d <= monthEnd;
    }).length;
  }, [expenses, hasAccess]);

  const isLimited = !hasAccess('unlimited_transactions');

  return {
    canAddTransaction: !isLimited || transactionsThisMonth < FREE_LIMITS.transactions_per_month,
    canAddPaymentSource: hasAccess('unlimited_payment_sources') || paymentSourceCount < FREE_LIMITS.payment_sources,
    canAddBudget: hasAccess('unlimited_budgets') || budgetCount < FREE_LIMITS.budgets,
    transactionsThisMonth,
    transactionLimit: FREE_LIMITS.transactions_per_month,
    paymentSourceCount,
    paymentSourceLimit: FREE_LIMITS.payment_sources,
    budgetCount,
    budgetLimit: FREE_LIMITS.budgets,
    isLimited,
  };
}
