/**
 * Reads the database guard that protects payout expenses.
 *
 * An expense created by paying a worker (`project_worker_payouts`) or a
 * collaborator (`project_collaborator_payments`) may not be deleted or edited
 * directly — the trigger `_guard_expense_payout_write` refuses it with error
 * 42501. This module turns that raw refusal into a stable kind so the UI can
 * explain WHERE the money is undone, instead of showing "no permission".
 */

export type PayoutGuardKind = 'worker' | 'collaborator';

/**
 * Returns which payout path locked this expense, or null when the error is
 * something else entirely.
 */
export function payoutGuardKind(error: unknown): PayoutGuardKind | null {
  const raw = typeof error === 'string' ? error : String((error as any)?.message ?? '');
  const msg = raw.toLowerCase();
  if (!msg.includes('forbidden for')) return null;
  if (msg.includes('collaborator payment expense')) return 'collaborator';
  if (msg.includes('owner payout expense')) return 'worker';
  return null;
}

export const PAYOUT_GUARD_I18N_KEY: Record<PayoutGuardKind, string> = {
  worker: 'errors.payoutExpenseLockedWorker',
  collaborator: 'errors.payoutExpenseLockedCollaborator',
};

export const PAYOUT_GUARD_FALLBACK: Record<PayoutGuardKind, string> = {
  worker:
    'This expense came from a worker payout — void the payout on the worker card to undo it.',
  collaborator:
    'This expense came from a collaborator payment — void the payment on the collaborator card to undo it.',
};
