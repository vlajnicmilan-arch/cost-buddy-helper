import { describe, it, expect } from 'vitest';
import {
  canResolveRequest,
  canWithdrawRequest,
  canWithdrawProposal,
  computeContractDelta,
  getAdminActions,
  isDecisionParty,
  type DecisionAdminRequest,
} from '@/lib/decisionAdminRequests';

const OWNER = 'owner-uuid';
const INV = 'investor-uuid';
const OTHER = 'stranger-uuid';

const baseReq = (over: Partial<DecisionAdminRequest> = {}): DecisionAdminRequest => ({
  id: 'r1',
  decision_id: 'd1',
  project_id: 'p1',
  type: 'annul',
  status: 'pending',
  requested_by: OWNER,
  resolved_by: null,
  resolved_at: null,
  reason: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
});

describe('isDecisionParty', () => {
  it('recognizes owner and investor', () => {
    expect(isDecisionParty({ currentUserId: OWNER, ownerUserId: OWNER, investorUserId: INV })).toBe(true);
    expect(isDecisionParty({ currentUserId: INV, ownerUserId: OWNER, investorUserId: INV })).toBe(true);
    expect(isDecisionParty({ currentUserId: OTHER, ownerUserId: OWNER, investorUserId: INV })).toBe(false);
  });
});

describe('getAdminActions', () => {
  it('returns nothing for active (awaiting_response) decision', () => {
    const a = getAdminActions({
      currentUserId: OWNER, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'awaiting_response', isAnnulled: false, pendingRequest: null,
    });
    expect(a).toEqual({
      canRequestAnnul: false,
      canResolvePending: false, canWithdrawPending: false,
    });
  });

  it('returns nothing for non-party', () => {
    const a = getAdminActions({
      currentUserId: OTHER, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'approved', isAnnulled: false, pendingRequest: null,
    });
    expect(a.canRequestAnnul).toBe(false);
    expect(a.canResolvePending).toBe(false);
  });

  it('allows annul on a closed decision without pending', () => {
    const a = getAdminActions({
      currentUserId: INV, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'approved', isAnnulled: false, pendingRequest: null,
    });
    expect(a.canRequestAnnul).toBe(true);
  });

  it('blocks annul once already annulled', () => {
    const a = getAdminActions({
      currentUserId: INV, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'approved', isAnnulled: true, pendingRequest: null,
    });
    expect(a.canRequestAnnul).toBe(false);
  });

  it('with a pending request: requester can withdraw, cannot resolve', () => {
    const req = baseReq({ requested_by: OWNER });
    const a = getAdminActions({
      currentUserId: OWNER, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'approved', isAnnulled: false, pendingRequest: req,
    });
    expect(a.canWithdrawPending).toBe(true);
    expect(a.canResolvePending).toBe(false);
    expect(a.canRequestAnnul).toBe(false);
  });

  it('with a pending request: other party can resolve, cannot withdraw', () => {
    const req = baseReq({ requested_by: OWNER });
    const a = getAdminActions({
      currentUserId: INV, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'approved', isAnnulled: false, pendingRequest: req,
    });
    expect(a.canResolvePending).toBe(true);
    expect(a.canWithdrawPending).toBe(false);
    expect(a.canRequestAnnul).toBe(false);
  });
});

describe('canResolveRequest / canWithdrawRequest', () => {
  it('requester cannot resolve their own request', () => {
    expect(canResolveRequest(baseReq({ requested_by: OWNER }), OWNER)).toBe(false);
  });
  it('other party can resolve pending', () => {
    expect(canResolveRequest(baseReq({ requested_by: OWNER }), INV)).toBe(true);
  });
  it('nobody can resolve non-pending', () => {
    expect(canResolveRequest(baseReq({ status: 'confirmed' }), INV)).toBe(false);
    expect(canResolveRequest(baseReq({ status: 'withdrawn' }), INV)).toBe(false);
  });
  it('only requester can withdraw pending', () => {
    expect(canWithdrawRequest(baseReq({ requested_by: OWNER }), OWNER)).toBe(true);
    expect(canWithdrawRequest(baseReq({ requested_by: OWNER }), INV)).toBe(false);
    expect(canWithdrawRequest(baseReq({ status: 'confirmed' }), OWNER)).toBe(false);
  });
});

describe('computeContractDelta', () => {
  it('returns 0 when there was no amendment', () => {
    expect(computeContractDelta(null)).toBe(0);
    expect(computeContractDelta(undefined)).toBe(0);
    expect(computeContractDelta(0)).toBe(0);
  });
  it('reverses positive amendments', () => {
    expect(computeContractDelta(5000)).toBe(-5000);
  });
  it('reverses negative amendments (reductions become +)', () => {
    expect(computeContractDelta(-800)).toBe(800);
  });
});

describe('canWithdrawProposal', () => {
  it('allows author to withdraw when active and only initial step exists', () => {
    expect(canWithdrawProposal({
      currentUserId: OWNER, decisionCreatedBy: OWNER,
      decisionStatus: 'awaiting_response', stepsCount: 1,
    })).toBe(true);
  });

  it('blocks non-authors even if steps_count=1', () => {
    expect(canWithdrawProposal({
      currentUserId: INV, decisionCreatedBy: OWNER,
      decisionStatus: 'awaiting_response', stepsCount: 1,
    })).toBe(false);
  });

  it('blocks once other party has responded (steps_count > 1)', () => {
    expect(canWithdrawProposal({
      currentUserId: OWNER, decisionCreatedBy: OWNER,
      decisionStatus: 'awaiting_response', stepsCount: 2,
    })).toBe(false);
    expect(canWithdrawProposal({
      currentUserId: OWNER, decisionCreatedBy: OWNER,
      decisionStatus: 'awaiting_response', stepsCount: 4,
    })).toBe(false);
  });

  it('blocks when decision no longer active', () => {
    for (const status of ['approved', 'rejected', 'closed'] as const) {
      expect(canWithdrawProposal({
        currentUserId: OWNER, decisionCreatedBy: OWNER,
        decisionStatus: status, stepsCount: 1,
      })).toBe(false);
    }
  });

  it('blocks when no user id', () => {
    expect(canWithdrawProposal({
      currentUserId: '', decisionCreatedBy: OWNER,
      decisionStatus: 'awaiting_response', stepsCount: 1,
    })).toBe(false);
  });
});
