import type { ProjectExpense, ProjectTransactionFilterState } from '@/components/projects/project-transactions/types';

export type { ProjectExpense, ProjectTransactionFilterState };

const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export function filterProjectExpenses(
  expenses: ProjectExpense[],
  c: ProjectTransactionFilterState,
): ProjectExpense[] {
  const term = c.searchTerm.trim().toLowerCase();
  return expenses.filter((e) => {
    if (term && !e.description.toLowerCase().includes(term)) return false;
    if (c.filterMilestoneId === 'none' && e.milestone_id) return false;
    if (
      c.filterMilestoneId !== 'all' &&
      c.filterMilestoneId !== 'none' &&
      e.milestone_id !== c.filterMilestoneId
    )
      return false;
    if (c.filterDateRange?.from) {
      const itemDate = startOfDay(new Date(e.date));
      const from = startOfDay(c.filterDateRange.from);
      if (itemDate < from) return false;
      if (c.filterDateRange.to) {
        const to = endOfDay(c.filterDateRange.to);
        if (itemDate > to) return false;
      }
    }
    if (c.filterPaymentSource !== 'all' && e.payment_source !== c.filterPaymentSource) return false;
    if (c.filterExpenseNature !== 'all' && e.expense_nature !== c.filterExpenseNature) return false;
    if (c.filterCategory !== 'all' && e.category !== c.filterCategory) return false;
    if (c.filterWorkType !== 'all' && e.work_type !== c.filterWorkType) return false;
    return true;
  });
}

export interface ProjectExpenseTotals {
  totalExpenses: number;
  totalIncome: number;
  net: number;
  totalMaterial: number;
  totalLabor: number;
}

export function computeProjectExpenseTotals(filtered: ProjectExpense[]): ProjectExpenseTotals {
  let totalExpenses = 0;
  let totalIncome = 0;
  let totalMaterial = 0;
  let totalLabor = 0;
  for (const e of filtered) {
    if (e.type === 'expense') {
      totalExpenses += e.amount;
      if (e.work_type === 'material') totalMaterial += e.amount;
      else if (e.work_type === 'labor') totalLabor += e.amount;
    } else if (e.type === 'income') {
      totalIncome += e.amount;
    }
  }
  return {
    totalExpenses,
    totalIncome,
    net: totalIncome - totalExpenses,
    totalMaterial,
    totalLabor,
  };
}

export function hasActiveProjectFilters(c: ProjectTransactionFilterState): boolean {
  return Boolean(
    c.searchTerm.trim() ||
      c.filterMilestoneId !== 'all' ||
      c.filterDateRange?.from ||
      c.filterPaymentSource !== 'all' ||
      c.filterExpenseNature !== 'all' ||
      c.filterCategory !== 'all' ||
      c.filterWorkType !== 'all',
  );
}

export const EMPTY_PROJECT_FILTER_STATE: ProjectTransactionFilterState = {
  searchTerm: '',
  filterMilestoneId: 'all',
  filterDateRange: undefined,
  filterPaymentSource: 'all',
  filterExpenseNature: 'all',
  filterCategory: 'all',
  filterWorkType: 'all',
};
