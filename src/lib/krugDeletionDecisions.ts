/**
 * Pure helperi za odluke u Krug deletion flow-u.
 * Zaključavaju logiku koju `krug_request_deletion` / `krug_vote_deletion` RPC-i
 * provode na DB strani. Korišteno za vitest pokrivenost i UI hint poruke.
 */

export type DeletionOutcome =
  | 'ok_deleted_solo'
  | 'ok_request_created'
  | 'ok_vote_recorded'
  | 'ok_approved_and_deleted'
  | 'ok_rejected'
  | 'ok_cancelled'
  | 'not_owner'
  | 'not_eligible'
  | 'request_already_pending'
  | 'no_pending_request'
  | 'krug_not_found'
  | 'already_deleted'
  | 'unauthorized';

export interface FullMemberCountInput {
  hasOwner: boolean;
  punopravniNonOwnerCount: number;
}

/** Broj punopravnih (owner + non-owner punopravni). */
export function countFullMembers(i: FullMemberCountInput): number {
  return (i.hasOwner ? 1 : 0) + Math.max(0, i.punopravniNonOwnerCount);
}

export interface RequestDeletionInput {
  isOwner: boolean;
  krugExists: boolean;
  krugDeleted: boolean;
  pendingRequest: boolean;
  fullMemberCount: number;
}

/** Što vraća `krug_request_deletion`. */
export function decideRequestDeletion(i: RequestDeletionInput): DeletionOutcome {
  if (!i.krugExists) return 'krug_not_found';
  if (i.krugDeleted) return 'already_deleted';
  if (!i.isOwner) return 'not_owner';
  if (i.pendingRequest) return 'request_already_pending';
  if (i.fullMemberCount <= 1) return 'ok_deleted_solo';
  return 'ok_request_created';
}

export interface VoteDeletionInput {
  hasPending: boolean;
  voterIsFullMember: boolean;
  approve: boolean;
  /** Broj `approve=true` glasova NAKON što se trenutni glas upiše. */
  approveCountAfter: number;
  fullMemberCount: number;
}

/** Što vraća `krug_vote_deletion`. */
export function decideVote(i: VoteDeletionInput): DeletionOutcome {
  if (!i.hasPending) return 'no_pending_request';
  if (!i.voterIsFullMember) return 'not_eligible';
  if (!i.approve) return 'ok_rejected';
  if (i.approveCountAfter >= i.fullMemberCount) return 'ok_approved_and_deleted';
  return 'ok_vote_recorded';
}

export interface CancelDeletionInput {
  isOwner: boolean;
  hasPending: boolean;
}

export function decideCancel(i: CancelDeletionInput): DeletionOutcome {
  if (!i.isOwner) return 'not_owner';
  if (!i.hasPending) return 'no_pending_request';
  return 'ok_cancelled';
}

const OK = new Set<DeletionOutcome>([
  'ok_deleted_solo',
  'ok_request_created',
  'ok_vote_recorded',
  'ok_approved_and_deleted',
  'ok_rejected',
  'ok_cancelled',
]);

export function isOkOutcome(o: DeletionOutcome | string): boolean {
  return OK.has(o as DeletionOutcome);
}
