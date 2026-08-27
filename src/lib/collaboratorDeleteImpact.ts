/**
 * What is lost when a collaborator engagement is deleted.
 *
 * Mirrors `workerDeleteImpact.ts`: presentation only, changes no deletion
 * logic. Counts the live payments tied to the engagement and their sum so the
 * confirmation dialog can say the truth instead of "nešto nije uspjelo".
 *
 * Since `delete_collaborator` exists, only LIVE payments block the delete —
 * voided ones are removed together with the collaborator.
 */
import { livePayments, round2, type CollaboratorPaymentRow } from '@/lib/collaboratorPayment';

export interface CollaboratorDeleteImpact {
  paymentCount: number;
  paidTotal: number;
  /** Voided payments that would be removed together with the collaborator. */
  voidedCount: number;
  /** true when live payments exist — deletion is refused by the database. */
  blocked: boolean;
}

export const summarizeCollaboratorDeleteImpact = (
  payments: readonly CollaboratorPaymentRow[],
  collaboratorId: string,
): CollaboratorDeleteImpact => {
  const mineAll = payments.filter((p) => p.collaborator_id === collaboratorId);
  const mine = livePayments(mineAll);
  const paidTotal = round2(mine.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  return {
    paymentCount: mine.length,
    paidTotal,
    voidedCount: mineAll.length - mine.length,
    blocked: mine.length > 0,
  };
};

export type CollaboratorDeleteReasonKind =
  | 'has_live_payments'
  | 'not_owner'
  | 'not_found'
  | 'unknown';

export interface CollaboratorDeleteReason {
  kind: CollaboratorDeleteReasonKind;
  /** Number of live payments blocking the delete. */
  paymentCount?: number;
  /** Sum of those live payments. */
  paidTotal?: number;
  code: string | null;
  message: string;
}

/** Turns the raw `delete_collaborator` failure into a truthful reason. */
export const parseCollaboratorDeleteError = (
  err: { code?: string | null; message?: string | null; details?: string | null } | null | undefined,
): CollaboratorDeleteReason => {
  const code = err?.code ?? null;
  const message = String(err?.message ?? '');
  const haystack = [message, err?.details ?? ''].join(' ');

  const live = haystack.match(/collaborator_has_live_payments\|(\d+)\|([0-9.]+)/);
  if (live) {
    return {
      kind: 'has_live_payments',
      paymentCount: Number(live[1]),
      paidTotal: Number(live[2]),
      code,
      message,
    };
  }
  if (haystack.includes('collaborator_not_found') || code === 'P0002') {
    return { kind: 'not_found', code, message };
  }
  if (haystack.includes('not_project_owner') || code === '42501') {
    return { kind: 'not_owner', code, message };
  }
  return { kind: 'unknown', code, message };
};
