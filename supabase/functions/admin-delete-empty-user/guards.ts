// Pure guard logic for admin-delete-empty-user, kept Deno-free so it can be
// unit-tested from the app test suite. The server report is the only input:
// the client never contributes to this decision.

export interface EmptinessBlocker {
  table: string;
  /** The user-referencing column that produced the rows (e.g. `deleted_by`). */
  column?: string;
  count: number;
  kind?: string;
}

export interface EmptinessReport {
  user_id: string;
  empty: boolean;
  blockers: EmptinessBlocker[];
  is_admin: boolean;
  is_self: boolean;
  checked_tables: string[];
  checked_count: number;
  checked_at: string;
}

export type GuardError =
  | 'cannot_delete_self'
  | 'cannot_delete_admin'
  | 'account_not_empty';

export interface GuardOutcome {
  allowed: boolean;
  error?: GuardError;
  status: number;
}

/**
 * `check` mode still refuses self/admin targets (the tool must never present
 * them as deletable); emptiness only blocks the actual deletion.
 */
export function evaluateDeletionGuards(
  report: EmptinessReport,
  mode: 'check' | 'delete',
): GuardOutcome {
  if (report.is_self) return { allowed: false, error: 'cannot_delete_self', status: 403 };
  if (report.is_admin) return { allowed: false, error: 'cannot_delete_admin', status: 403 };
  if (mode === 'delete' && !report.empty) {
    return { allowed: false, error: 'account_not_empty', status: 409 };
  }
  return { allowed: true, status: 200 };
}
