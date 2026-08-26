/**
 * Truthful reasons why deleting a project worker engagement failed.
 *
 * Pure mapping helper: takes the raw PostgREST/Postgres error and turns it
 * into a stable machine reason. The UI translates it; diagnostics logs the
 * literal code/message from the database.
 */

export type WorkerDeleteReasonKind =
  | 'has_payouts'
  | 'has_locked_entries'
  | 'not_owner'
  | 'not_found'
  | 'unknown';

export interface WorkerDeleteReason {
  kind: WorkerDeleteReasonKind;
  /** Number of payouts blocking the delete (only for `has_payouts`). */
  payoutCount?: number;
  /** Whether archiving is a sensible way out. */
  archivable: boolean;
  /** Literal database code, for diagnostics. */
  code: string | null;
  /** Literal database message, for diagnostics. */
  message: string;
}

interface RawError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export const parseWorkerDeleteError = (err: RawError | null | undefined): WorkerDeleteReason => {
  const code = err?.code ?? null;
  const message = String(err?.message ?? '');
  const haystack = [message, err?.details ?? '', err?.hint ?? ''].join(' ');

  const payoutMatch = haystack.match(/worker_has_payouts\|(\d+)/);
  if (payoutMatch) {
    return {
      kind: 'has_payouts',
      payoutCount: Number(payoutMatch[1]),
      archivable: true,
      code,
      message,
    };
  }

  // Raw FK violation (delete attempted outside the RPC).
  if (code === '23503' && haystack.includes('project_worker_payouts_worker_id_fkey')) {
    return { kind: 'has_payouts', archivable: true, code, message };
  }

  if (haystack.includes('worker_has_locked_entries')) {
    return { kind: 'has_locked_entries', archivable: true, code, message };
  }

  if (haystack.includes('not_project_owner') || code === '42501') {
    return { kind: 'not_owner', archivable: false, code, message };
  }

  if (haystack.includes('worker_not_found') || code === 'P0002') {
    return { kind: 'not_found', archivable: false, code, message };
  }

  return { kind: 'unknown', archivable: false, code, message };
};
