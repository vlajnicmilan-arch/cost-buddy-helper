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
  return `${blocker.count} × ${blocker.table}`;
}

export function formatBlockerReason(blockers: EmptinessBlocker[], t: TFn, limit = 3): string {
  if (blockers.length === 0) return '';
  const shown = topBlockers(blockers, limit).map((b) => formatBlocker(b, t));
  const rest = blockers.length - shown.length;
  const base = shown.join(', ');
  return rest > 0 ? t('admin.emptyAccount.reasonMore', { reason: base, count: rest }) : base;
}
