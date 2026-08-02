/**
 * Korak E — single source of truth for "does this expense count?".
 *
 * A row counts toward ANY money aggregate (wallet balance, project spent,
 * milestone spent, margin, budgets, reports, summaries) only when its review
 * status is `approved`. Rows in `pending` (submitted by a project member,
 * awaiting the owner's decision) and `rejected` (declined, kept as a record)
 * are invisible to every sum.
 *
 * Two mirrors exist and MUST stay in sync:
 *   - client: this file
 *   - edge:   supabase/functions/_shared/countedExpense.ts
 *
 * `src/lib/__tests__/countedExpenseLint.test.ts` fails when a new `expenses`
 * read query appears without one of these filters.
 */

export const COUNTED_EXPENSE_STATUSES = ['approved'] as const;

export type CountedExpenseStatus = (typeof COUNTED_EXPENSE_STATUSES)[number];

/** Pure predicate for in-memory rows. `null`/`undefined` legacy rows count. */
export const isCountedExpenseStatus = (status?: string | null): boolean =>
  status == null || status === 'approved';

/** Pure predicate over a row-shaped object. */
export const isCountedExpenseRow = (row: { status?: string | null }): boolean =>
  isCountedExpenseStatus(row?.status);

/** Filters an in-memory list down to rows that count. */
export const filterCountedExpenses = <T extends { status?: string | null }>(rows: T[]): T[] =>
  rows.filter(isCountedExpenseRow);

/**
 * Applies the counted-status filter to a PostgREST query builder.
 * Typed loosely on purpose — the same call site shape is used for
 * `supabase.from('expenses').select(...)` chains everywhere.
 *
 * NULL mora proći: motor salda (`COALESCE(e.status,'approved')`) i klijentski
 * `isCountedExpenseRow` tretiraju redak bez statusa kao `approved`. SQL `IN`
 * ne hvata NULL, pa bi `.in('status', [...])` tiho odbacio takve retke —
 * odstupanje, ne pravilo. Zato `.or(...)`.
 */
export const applyCountedFilter = <T extends { or: (filter: string) => T }>(
  query: T,
): T => query.or(`status.is.null,${COUNTED_EXPENSE_STATUSES.map((s) => `status.eq.${s}`).join(',')}`);

