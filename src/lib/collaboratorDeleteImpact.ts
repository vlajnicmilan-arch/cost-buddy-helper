/**
 * What is lost when a collaborator engagement is deleted.
 *
 * Mirrors `workerDeleteImpact.ts`: presentation only, changes no deletion
 * logic. Counts the live payments tied to the engagement and their sum so the
 * confirmation dialog can say the truth instead of "nešto nije uspjelo".
 */
import { livePayments, round2, type CollaboratorPaymentRow } from '@/lib/collaboratorPayment';

export interface CollaboratorDeleteImpact {
  paymentCount: number;
  paidTotal: number;
  /** true when payments exist — deletion is blocked by the FK (ON DELETE RESTRICT). */
  blocked: boolean;
}

export const summarizeCollaboratorDeleteImpact = (
  payments: readonly CollaboratorPaymentRow[],
  collaboratorId: string,
): CollaboratorDeleteImpact => {
  const mine = livePayments(payments).filter((p) => p.collaborator_id === collaboratorId);
  const paidTotal = round2(mine.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  return { paymentCount: mine.length, paidTotal, blocked: mine.length > 0 };
};
