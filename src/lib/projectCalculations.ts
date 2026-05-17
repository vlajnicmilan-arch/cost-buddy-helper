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
  id?: string;
  amount: number | string;
  type: string;
  status?: string | null;
  expense_nature?: string | null;
  is_advance?: boolean | null;
  collaborator_id?: string | null;
  linked_advance_ids?: string[] | null;
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

/**
 * Net amount of an expense after subtracting linked advances.
 * - For an advance itself: returns 0 (it is "consumed" by the final invoice that links it,
 *   if any). If unlinked, the advance still counts at its full amount (real cash out).
 * - For a final invoice: returns max(amount - sum(linked advances), 0).
 *   Surplus (when advances exceed invoice) is handled by business_debts elsewhere.
 * - For everything else: returns raw amount.
 *
 * This eliminates double-counting when both an advance and a final invoice exist for the
 * same job (e.g. 500 advance + 3640 final invoice should count as 3640, not 4140).
 */
export const calculateNetExpenseAmount = (
  expense: RawProjectExpense,
  allExpenses: RawProjectExpense[]
): number => {
  const amount = Number(expense.amount || 0);
  if (expense.is_advance) {
    // Is this advance linked to any final invoice in the set?
    const linked = allExpenses.some(e =>
      !e.is_advance &&
      Array.isArray(e.linked_advance_ids) &&
      expense.id != null &&
      e.linked_advance_ids.includes(expense.id)
    );
    return linked ? 0 : amount;
  }
  const linkedIds = expense.linked_advance_ids || [];
  if (linkedIds.length === 0) return amount;
  const linkedSum = linkedIds.reduce((s, id) => {
    const a = allExpenses.find(e => e.id === id && e.is_advance);
    return a ? s + Number(a.amount || 0) : s;
  }, 0);
  return Math.max(amount - linkedSum, 0);
};

export const calculateProjectSpent = (expenses: RawProjectExpense[]): number => {
  return expenses
    .filter(e => isCounted(e) && e.type === 'expense')
    .reduce((sum, e) => sum + calculateNetExpenseAmount(e, expenses), 0);
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

// ─────────────────────────────────────────────────────────────────────
// Accrual / Contract-based calculations (dual P&L view)
// ─────────────────────────────────────────────────────────────────────

export interface RawProjectForContract {
  contract_value?: number | string | null;
  total_budget?: number | string | null;
}

/**
 * Resolves the project's contracted value (accrual basis).
 * Falls back to total_budget when contract_value is not set.
 * Returns 0 only when both are missing/zero.
 */
export const calculateContractValue = (project: RawProjectForContract | null | undefined): number => {
  if (!project) return 0;
  const cv = Number(project.contract_value || 0);
  if (cv > 0) return cv;
  return Number(project.total_budget || 0);
};

/**
 * Expected profit = contract value − all incurred costs (cash basis spent).
 * Use this for "how profitable is this contract as a whole".
 */
export const calculateExpectedProfit = (
  project: RawProjectForContract | null | undefined,
  expenses: RawProjectExpense[]
): number => {
  return calculateContractValue(project) - calculateProjectSpent(expenses);
};

/**
 * Collection progress = collected income / contract value × 100.
 * Caps at 100. Returns 0 when contract value is 0.
 */
export const calculateCollectionProgress = (
  project: RawProjectForContract | null | undefined,
  expenses: RawProjectExpense[],
  funding: RawFundingRow[] = []
): number => {
  const contract = calculateContractValue(project);
  if (contract <= 0) return 0;
  const collected = calculateProjectIncome(expenses, funding);
  return Math.min((collected / contract) * 100, 100);
};

/**
 * Remaining amount to collect from the client (contract − collected income).
 * Never negative.
 */
export const calculateRemainingToCollect = (
  project: RawProjectForContract | null | undefined,
  expenses: RawProjectExpense[],
  funding: RawFundingRow[] = []
): number => {
  const contract = calculateContractValue(project);
  const collected = calculateProjectIncome(expenses, funding);
  return Math.max(contract - collected, 0);
};
