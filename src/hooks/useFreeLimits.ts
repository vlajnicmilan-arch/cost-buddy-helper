/**
 * useFreeLimits — read-only projekcija stanja Free razine.
 *
 * IZVOR ISTINE za broj transakcija = server counter iz
 * `free_tier_usage_monthly` (increment-only, ne pada na DELETE).
 * Fallback na klijentski računanje `expenses[]` samo kada server
 * odgovor još nije stigao — server trigger svejedno enforcea.
 */
import { useMemo } from 'react';
import { useFeatureAccess, FREE_LIMITS } from '@/hooks/useFeatureAccess';
import { useFreeTierUsage } from '@/hooks/useFreeTierUsage';
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
