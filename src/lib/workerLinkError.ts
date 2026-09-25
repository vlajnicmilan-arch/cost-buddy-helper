/**
 * Error codes raised by the `link_worker_to_member` RPC, mapped to i18n keys.
 * Unknown codes fall back to the generic message (and are always logged).
 */
export const WORKER_LINK_ERROR_KEYS = {
  not_authenticated: 'projects.linkNotAuthenticated',
  not_authorized: 'projects.linkNotAuthorized',
  worker_not_found: 'projects.workerNotFound',
  user_already_linked_to_other_worker: 'projects.userAlreadyLinked',
} as const;

export type WorkerLinkErrorCode = keyof typeof WORKER_LINK_ERROR_KEYS;

export function resolveWorkerLinkErrorCode(message: unknown): WorkerLinkErrorCode | 'unknown' {
  const msg = typeof message === 'string' ? message : '';
  const known = (Object.keys(WORKER_LINK_ERROR_KEYS) as WorkerLinkErrorCode[]).find((k) => msg.includes(k));
  return known ?? 'unknown';
}

export function workerLinkErrorKey(message: unknown): string {
  const code = resolveWorkerLinkErrorCode(message);
  return code === 'unknown' ? 'common.error' : WORKER_LINK_ERROR_KEYS[code];
}

/** Sum of hours for a transferred set of work entries (null/NaN count as 0). */
export function sumEntryHours(rows: ReadonlyArray<{ actual_hours: number | string | null }>): number {
  return rows.reduce((acc, r) => {
    const n = Number(r.actual_hours);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}
