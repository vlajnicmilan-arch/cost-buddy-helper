/**
 * Centralised test-id catalogue. Keep in sync with `data-testid` attributes in source.
 * One source of truth so renames don't scatter through spec files.
 */
export const tid = {
  // Global navigation
  bottomNavHome: 'nav-home',
  bottomNavBudgets: 'nav-budgets',
  bottomNavProjects: 'nav-projects',

  // Manual expense form
  addExpenseFab: 'add-expense-fab',
  manualExpenseAmount: 'manual-expense-amount',
  manualExpenseDescription: 'manual-expense-description',
  manualExpenseSubmit: 'manual-expense-submit',

  // Transactions list
  transactionRow: 'transaction-row',
  transactionDeleteAction: 'transaction-delete',
  undoToastButton: 'undo-toast-button',

  // Budgets
  budgetCreateButton: 'budget-create',
  budgetNameInput: 'budget-name',
  budgetAmountInput: 'budget-amount',
  budgetSaveButton: 'budget-save',
  budgetCard: 'budget-card',

  // Projects
  projectCreateButton: 'project-create',
  projectNameInput: 'project-name',
  projectTypeSelect: 'project-type-select',
  projectSaveButton: 'project-save',
  milestoneAddButton: 'milestone-add',
  milestoneNameInput: 'milestone-name',
  milestoneSaveButton: 'milestone-save',
  milestoneRow: 'milestone-row',
  milestoneCompleteButton: 'milestone-complete',

  // Import
  importOpenButton: 'import-open',
  importFileInput: 'import-file-input',
  importConfirmButton: 'import-confirm',
  importBatchRow: 'import-batch-row',
} as const;

export type Tid = typeof tid;
