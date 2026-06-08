/**
 * P0 — Core Financial Contamination Fix
 *
 * Pure helpers that constrain "personal" expense fetches to:
 *   - rows the current user authored (`user_id = uid`), OR
 *   - rows on a payment source the user has explicit membership on
 *     (owned `custom_payment_sources` OR `payment_source_members` row).
 *
 * Without this filter, the `expenses` SELECT relies entirely on RLS, and the
 * `is_project_member(project_id, auth.uid())` branch leaks every project
 * teammate's transactions into the requesting user's personal dataset
 * (Dashboard, Reports, Calendar, Search, Cashflow, Active Issues, ...).
 *
 * Defense-in-depth at the RLS layer is deferred to a later sweep — this is the
 * client-side patch that closes the leak without touching DB or edge code.
 */

export interface ScopeContext {
  /** Authenticated user id. Required. */
  userId: string;
  /**
   * Payment source ids the user has access to:
   *   - sources they own (custom_payment_sources.user_id = uid), AND
   *   - sources where they have a row in payment_source_members.
   *
   * Format: bare UUIDs (no `custom:` prefix). The helper adds the prefix
   * where the column needs it.
   */
  sharedPaymentSourceIds: ReadonlySet<string>;
}

/**
 * Build a PostgREST `.or(...)` filter string that restricts the `expenses`
 * SELECT to the caller's personal scope. Returns null when the caller is not
 * authenticated (caller should skip the query entirely).
 *
 * Output example with sharedIds = {a, b}:
 *   user_id.eq.UID,payment_source.in.(custom:a,custom:b),income_source_id.in.(a,b)
 *
 * The `income_source_id.in.(...)` branch covers the transfer case where the
 * destination of an incoming transfer is one of the user's shared sources.
 */
export function buildExpenseScopeFilter(ctx: ScopeContext | null): string | null {
  if (!ctx || !ctx.userId) return null;
  const parts: string[] = [`user_id.eq.${ctx.userId}`];

  if (ctx.sharedPaymentSourceIds.size > 0) {
    const ids = Array.from(ctx.sharedPaymentSourceIds);
    const customList = ids.map(id => `custom:${id}`).join(',');
    parts.push(`payment_source.in.(${customList})`);
    parts.push(`income_source_id.in.(${ids.join(',')})`);
  }

  return parts.join(',');
}

/** Minimal shape we need to evaluate scope on a realtime payload. */
export interface ScopeEvaluable {
  user_id?: string | null;
  payment_source?: string | null;
  income_source_id?: string | null;
  type?: string | null;
}

/**
 * Mirror of `buildExpenseScopeFilter` in JS — used by the realtime handler
 * (postgres_changes) to discard INSERT/UPDATE events that leak in via the
 * `is_project_member` RLS branch but don't actually belong to the caller's
 * personal scope.
 */
export function belongsToMyScope(
  row: ScopeEvaluable | null | undefined,
  ctx: ScopeContext | null,
): boolean {
  if (!row || !ctx || !ctx.userId) return false;

  if (row.user_id && row.user_id === ctx.userId) return true;

  if (ctx.sharedPaymentSourceIds.size > 0) {
    const cleanPs = (row.payment_source ?? '').replace(/^custom:/, '');
    if (cleanPs && ctx.sharedPaymentSourceIds.has(cleanPs)) return true;

    if (
      row.type === 'transfer' &&
      row.income_source_id &&
      ctx.sharedPaymentSourceIds.has(row.income_source_id)
    ) {
      return true;
    }
  }

  return false;
}
