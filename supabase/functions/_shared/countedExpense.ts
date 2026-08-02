/**
 * Korak E — edge mirror of `src/lib/countedExpense.ts`.
 *
 * Only `approved` expenses count toward any money aggregate. `pending` and
 * `rejected` rows exist as records but are invisible to every sum.
 * Keep this file byte-compatible in behaviour with the client mirror.
 */

export const COUNTED_EXPENSE_STATUSES = ['approved'] as const;

export const isCountedExpenseStatus = (status?: string | null): boolean =>
  status == null || status === 'approved';

export const isCountedExpenseRow = (row: { status?: string | null }): boolean =>
  isCountedExpenseStatus(row?.status);

export const filterCountedExpenses = <T extends { status?: string | null }>(rows: T[]): T[] =>
  rows.filter(isCountedExpenseRow);

export const applyCountedFilter = <T extends { in: (col: string, values: readonly unknown[]) => T }>(
  query: T,
): T => query.in('status', COUNTED_EXPENSE_STATUSES as readonly string[]);
