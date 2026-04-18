/**
 * Unified project financial calculations.
 * All three views (ProjectsPanel, ProjectFullScreenView, BusinessProjects) use these functions
 * to ensure the "Spent" / "Income" / "Balance" numbers are always identical.
 *
 * Rules:
 * - Only `status = 'approved'` (or null) transactions are counted
 * - Transfers (`type = 'transfer'`) are excluded
 * - Manual balance corrections (`expense_nature = 'correction'`) are excluded
 * - Spent = sum of approved EXPENSE transactions
 * - Income = sum of approved INCOME transactions + project_funding allocations
 */

export interface RawProjectExpense {
  amount: number | string;
  type: string;
  status?: string | null;
  expense_nature?: string | null;
}

export interface RawFundingRow {
  allocated_amount: number | string | null;
}

const isCounted = (e: RawProjectExpense): boolean => {
  if (e.type === 'transfer') return false;
  if (e.expense_nature === 'correction') return false;
  if (e.status && e.status !== 'approved') return false;
  return true;
};

export const calculateProjectSpent = (expenses: RawProjectExpense[]): number => {
  return expenses
    .filter(e => isCounted(e) && e.type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
};

export const calculateProjectIncomeFromTransactions = (expenses: RawProjectExpense[]): number => {
  return expenses
    .filter(e => isCounted(e) && e.type === 'income')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
};

export const calculateFundingTotal = (funding: RawFundingRow[]): number => {
  return funding.reduce((sum, f) => sum + Number(f.allocated_amount || 0), 0);
};

export const calculateProjectIncome = (
  expenses: RawProjectExpense[],
  funding: RawFundingRow[]
): number => {
  return calculateProjectIncomeFromTransactions(expenses) + calculateFundingTotal(funding);
};

export const calculateProjectBalance = (
  expenses: RawProjectExpense[],
  funding: RawFundingRow[]
): number => {
  return calculateProjectIncome(expenses, funding) - calculateProjectSpent(expenses);
};

export const calculateProjectProgress = (
  spent: number,
  totalBudget: number
): number => {
  if (totalBudget <= 0) return 0;
  return Math.min((spent / totalBudget) * 100, 100);
};
