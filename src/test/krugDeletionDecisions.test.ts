import { describe, it, expect } from 'vitest';
import {
  countFullMembers,
  decideRequestDeletion,
  decideVote,
  decideCancel,
  isOkOutcome,
} from '@/lib/krugDeletionDecisions';

describe('countFullMembers', () => {
  it('owner sam', () => {
    expect(countFullMembers({ hasOwner: true, punopravniNonOwnerCount: 0 })).toBe(1);
  });
  it('owner + 2 punopravna', () => {
    expect(countFullMembers({ hasOwner: true, punopravniNonOwnerCount: 2 })).toBe(3);
  });
  it('bez ownera', () => {
    expect(countFullMembers({ hasOwner: false, punopravniNonOwnerCount: 3 })).toBe(3);
  });
});

describe('decideRequestDeletion', () => {
  const base = { isOwner: true, krugExists: true, krugDeleted: false, pendingRequest: false, fullMemberCount: 1 };
  it('solo owner → odmah brisanje', () => {
    expect(decideRequestDeletion(base)).toBe('ok_deleted_solo');
  });
  it('owner + 1 punopravni → kreira request', () => {
    expect(decideRequestDeletion({ ...base, fullMemberCount: 2 })).toBe('ok_request_created');
  });
  it('non-owner → not_owner', () => {
    expect(decideRequestDeletion({ ...base, isOwner: false })).toBe('not_owner');
  });
  it('postoji pending → request_already_pending', () => {
    expect(decideRequestDeletion({ ...base, fullMemberCount: 2, pendingRequest: true })).toBe('request_already_pending');
  });
  it('već obrisan', () => {
    expect(decideRequestDeletion({ ...base, krugDeleted: true })).toBe('already_deleted');
  });
  it('ne postoji', () => {
    expect(decideRequestDeletion({ ...base, krugExists: false })).toBe('krug_not_found');
  });
});

describe('decideVote', () => {
  it('non-full → not_eligible', () => {
    expect(decideVote({ hasPending: true, voterIsFullMember: false, approve: true, approveCountAfter: 1, fullMemberCount: 2 })).toBe('not_eligible');
  });
  it('reject → odmah ok_rejected', () => {
    expect(decideVote({ hasPending: true, voterIsFullMember: true, approve: false, approveCountAfter: 1, fullMemberCount: 2 })).toBe('ok_rejected');
  });
  it('zadnji approve → ok_approved_and_deleted', () => {
    expect(decideVote({ hasPending: true, voterIsFullMember: true, approve: true, approveCountAfter: 3, fullMemberCount: 3 })).toBe('ok_approved_and_deleted');
  });
  it('parcijalni approve → ok_vote_recorded', () => {
    expect(decideVote({ hasPending: true, voterIsFullMember: true, approve: true, approveCountAfter: 2, fullMemberCount: 3 })).toBe('ok_vote_recorded');
  });
  it('nema pending → no_pending_request', () => {
    expect(decideVote({ hasPending: false, voterIsFullMember: true, approve: true, approveCountAfter: 1, fullMemberCount: 2 })).toBe('no_pending_request');
  });
});

describe('decideCancel', () => {
  it('owner + pending → ok_cancelled', () => {
    expect(decideCancel({ isOwner: true, hasPending: true })).toBe('ok_cancelled');
  });
  it('non-owner → not_owner', () => {
    expect(decideCancel({ isOwner: false, hasPending: true })).toBe('not_owner');
  });
  it('owner bez pending → no_pending_request', () => {
    expect(decideCancel({ isOwner: true, hasPending: false })).toBe('no_pending_request');
  });
});

describe('isOkOutcome', () => {
  it('OK ishodi', () => {
    expect(isOkOutcome('ok_deleted_solo')).toBe(true);
    expect(isOkOutcome('ok_approved_and_deleted')).toBe(true);
  });
  it('greške nisu OK', () => {
    expect(isOkOutcome('not_owner')).toBe(false);
    expect(isOkOutcome('unknown')).toBe(false);
  });
});
