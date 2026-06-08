/**
 * Unified project financial calculations.
 *
 * Rules (F1–F5 — Option A: funding is NOT income):
 * - Only `status = 'approved'` (or null) transactions are counted
 * - Transfers (`type = 'transfer'`) are excluded
 * - Manual balance corrections (`expense_nature = 'correction'`) are excluded
 * - Spent  = sum of approved EXPENSE transactions (with advance/invoice netting)
 * - Income = sum of approved INCOME transactions ONLY
 *            `project_funding.allocated_amount` is "Planirano financiranje" and
 *            MUST NOT be summed into Income / Balance / Collection.
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

/** Exposed for hooks that need the same filter against in-memory rows. */
export const isCountedProjectTransaction = isCounted;

/**
 * Net amount of an expense after subtracting linked advances.
 * - Advance linked to a final invoice → 0 (consumed). Unlinked advance → full amount.
 * - Final invoice → max(amount - sum(linked advances), 0).
 * - Anything else → raw amount.
 */
export const calculateNetExpenseAmount = (
  expense: RawProjectExpense,
  allExpenses: RawProjectExpense[]
): number => {
  const amount = Number(expense.amount || 0);
  if (expense.is_advance) {
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

/**
 * Realized project income (Option A).
 * Funding is intentionally NOT included — it is a separate KPI ("Planirano").
 */
export const calculateProjectIncome = (expenses: RawProjectExpense[]): number => {
  return calculateProjectIncomeFromTransactions(expenses);
};

/**
 * Realized cashflow balance = realized income − spent.
 * Funding is excluded (Option A).
 */
export const calculateProjectBalance = (expenses: RawProjectExpense[]): number => {
  return calculateProjectIncome(expenses) - calculateProjectSpent(expenses);
};

export const calculateProjectProgress = (
  spent: number,
  totalBudget: number
): number => {
  if (totalBudget <= 0) return 0;
  return Math.min((spent / totalBudget) * 100, 100);
};

// ─────────────────────────────────────────────────────────────────────
// Accrual / Contract-based calculations
// ─────────────────────────────────────────────────────────────────────

export interface RawProjectForContract {
  contract_value?: number | string | null;
  total_budget?: number | string | null;
}

export const calculateContractValue = (project: RawProjectForContract | null | undefined): number => {
  if (!project) return 0;
  const cv = Number(project.contract_value || 0);
  if (cv > 0) return cv;
  return Number(project.total_budget || 0);
};

export const calculateExpectedProfit = (
  project: RawProjectForContract | null | undefined,
  expenses: RawProjectExpense[]
): number => {
  return calculateContractValue(project) - calculateProjectSpent(expenses);
};

/**
 * Collection progress = realized income / contract value × 100 (capped at 100).
 * Funding is NOT counted as collected (Option A).
 */
export const calculateCollectionProgress = (
  project: RawProjectForContract | null | undefined,
  expenses: RawProjectExpense[]
): number => {
  const contract = calculateContractValue(project);
  if (contract <= 0) return 0;
  const collected = calculateProjectIncome(expenses);
  return Math.min((collected / contract) * 100, 100);
};

/**
 * Remaining to collect = contract − realized income, floored at 0.
 * Funding is NOT counted as collected (Option A).
 */
export const calculateRemainingToCollect = (
  project: RawProjectForContract | null | undefined,
  expenses: RawProjectExpense[]
): number => {
  const contract = calculateContractValue(project);
  const collected = calculateProjectIncome(expenses);
  return Math.max(contract - collected, 0);
};

/**
 * Computes the new contract value after applying a scope-change amendment.
 * Baseline = contract_value if > 0, else total_budget, else 0. Result floored at 0.
 */
export const applyContractAmendment = (
  contractValue: number | string | null | undefined,
  totalBudget: number | string | null | undefined,
  amendmentAmount: number | string | null | undefined
): number => {
  const cv = Number(contractValue || 0);
  const tb = Number(totalBudget || 0);
  const delta = Number(amendmentAmount || 0);
  const baseline = cv > 0 ? cv : tb;
  return Math.max(baseline + delta, 0);
};
