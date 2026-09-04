/**
 * Helpers for the admin "delete empty account" tool.
 *
 * The authority on emptiness is the server (SQL function `admin_account_emptiness`,
 * which derives the content-table list from the live schema). Everything here is
 * presentation only: turning the server's blocker list into a short human reason.
 */

export interface EmptinessBlocker {
  table: string;
  /** The user-referencing column that produced the rows (e.g. `deleted_by`). */
  column?: string;
  count: number;
  kind?: string;
}

export interface AccountEmptiness {
  empty: boolean;
  blockers: EmptinessBlocker[];
  is_admin: boolean;
  is_self: boolean;
}

export type AccountEmptinessMap = Record<string, AccountEmptiness>;

/** Tables that deserve a friendly noun in the reason line. */
const LABEL_KEYS: Record<string, string> = {
  expenses: 'admin.emptyAccount.entity.expenses',
  projects: 'admin.emptyAccount.entity.projects',
  budget_plans: 'admin.emptyAccount.entity.budgets',
  custom_payment_sources: 'admin.emptyAccount.entity.paymentSources',
  incoming_invoices: 'admin.emptyAccount.entity.invoices',
  imported_statements: 'admin.emptyAccount.entity.statements',
  savings_goals: 'admin.emptyAccount.entity.savingsGoals',
  krug_membership: 'admin.emptyAccount.entity.krug',
  business_profiles: 'admin.emptyAccount.entity.businessProfiles',
  clients: 'admin.emptyAccount.entity.clients',
  workers: 'admin.emptyAccount.entity.people',
};

export const PAID_BLOCKER_KIND = 'paid_subscription';

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** Sorted by count desc so the biggest reason is shown first. */
export function topBlockers(blockers: EmptinessBlocker[], limit = 3): EmptinessBlocker[] {
  return [...blockers].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function formatBlocker(blocker: EmptinessBlocker, t: TFn): string {
  if (blocker.kind === PAID_BLOCKER_KIND) {
    return t('admin.emptyAccount.entity.paidSubscription', { count: blocker.count });
  }
  const key = LABEL_KEYS[blocker.table];
  if (key) return t(key, { count: blocker.count });
  const where = blocker.column ? `${blocker.table}.${blocker.column}` : blocker.table;
  return `${blocker.count} × ${where}`;
}

/**
 * The server reports one blocker per user-referencing COLUMN, so the same table
 * can appear several times (e.g. `expenses.user_id` and `expenses.deleted_by`).
 * Labelled tables are merged into a single reason; unlabelled ones stay
 * per-column so the raw name still points at the exact place.
 */
export function mergeBlockers(blockers: EmptinessBlocker[]): EmptinessBlocker[] {
  const merged = new Map<string, EmptinessBlocker>();
  for (const b of blockers) {
    const groupKey = b.kind
      ? `kind:${b.kind}`
      : LABEL_KEYS[b.table]
        ? `table:${b.table}`
        : `col:${b.table}.${b.column ?? ''}`;
    const existing = merged.get(groupKey);
    if (existing) existing.count += b.count;
    else merged.set(groupKey, { ...b });
  }
  return [...merged.values()];
}

export function formatBlockerReason(blockers: EmptinessBlocker[], t: TFn, limit = 3): string {
  if (blockers.length === 0) return '';
  const grouped = mergeBlockers(blockers);
  const shown = topBlockers(grouped, limit).map((b) => formatBlocker(b, t));
  const rest = grouped.length - shown.length;
  const base = shown.join(', ');
  return rest > 0 ? t('admin.emptyAccount.reasonMore', { reason: base, count: rest }) : base;
}
