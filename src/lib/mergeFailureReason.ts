/**
 * Maps a raw error thrown by the `merge_manual_with_bank` RPC to a stable
 * reason code. Pure — unit tested, no i18n and no side effects.
 *
 * The RPC raises bare codes (`RAISE EXCEPTION 'bank_deleted'`), which Postgres
 * surfaces inside a longer message string, so matching is substring based.
 * Order matters: more specific codes must be checked before shorter ones that
 * are substrings of them (e.g. `manual_not_found` before `not_found`).
 */

export const MERGE_FAILURE_CODES = [
  'not_authenticated',
  'not_authorized',
  'manual_not_found',
  'bank_not_found',
  'manual_deleted',
  'bank_deleted',
  'manual_is_bank',
  'bank_is_manual',
  'already_confirmed',
  'different_type',
  'transfer_not_allowed',
  'correction_not_allowed',
  'different_source',
  'different_currency',
  'different_amount',
  'date_too_far',
  'advance_protected',
] as const;

export type MergeFailureCode = (typeof MERGE_FAILURE_CODES)[number] | 'missing_id' | 'unknown';

/** i18n key (relative to `transactions.merge.errors`) for every reason code. */
export const MERGE_FAILURE_I18N_KEY: Record<MergeFailureCode, string> = {
  not_authenticated: 'notAuthenticated',
  not_authorized: 'notAuthorized',
  manual_not_found: 'manualNotFound',
  bank_not_found: 'bankNotFound',
  manual_deleted: 'manualDeleted',
  bank_deleted: 'bankDeleted',
  manual_is_bank: 'bothBank',
  bank_is_manual: 'bothManual',
  already_confirmed: 'alreadyConfirmed',
  different_type: 'differentType',
  transfer_not_allowed: 'transferNature',
  correction_not_allowed: 'correctionNature',
  different_source: 'differentSource',
  different_currency: 'differentCurrency',
  different_amount: 'differentAmount',
  date_too_far: 'dateTooFar',
  advance_protected: 'advanceProtected',
  missing_id: 'missingId',
  unknown: 'unknown',
};

export interface RawMergeError {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** Extracts the reason code from whatever the database returned. */
export function resolveMergeFailureCode(err: unknown): MergeFailureCode {
  const e = (err ?? {}) as RawMergeError;
  const haystack = [
    typeof err === 'string' ? err : '',
    e.message ?? '',
    e.details ?? '',
    e.hint ?? '',
  ]
    .join(' ')
    .toLowerCase();

  for (const code of MERGE_FAILURE_CODES) {
    if (haystack.includes(code)) return code;
  }
  return 'unknown';
}

/** Non-personal, log-safe snapshot of the raw database error. */
export function describeMergeError(err: unknown): {
  code: MergeFailureCode;
  db_code: string | null;
  db_message: string | null;
} {
  const e = (err ?? {}) as RawMergeError;
  const message = typeof err === 'string' ? err : (e.message ?? null);
  return {
    code: resolveMergeFailureCode(err),
    db_code: e.code ? String(e.code) : null,
    db_message: message ? String(message).slice(0, 500) : null,
  };
}
