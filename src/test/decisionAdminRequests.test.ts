import { describe, it, expect } from 'vitest';
import {
  canResolveRequest,
  canWithdrawRequest,
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
      canRequestAnnul: false, canRequestDelete: false,
      canResolvePending: false, canWithdrawPending: false,
    });
  });

  it('returns nothing for non-party', () => {
    const a = getAdminActions({
      currentUserId: OTHER, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'approved', isAnnulled: false, pendingRequest: null,
    });
    expect(a.canRequestAnnul).toBe(false);
    expect(a.canRequestDelete).toBe(false);
    expect(a.canResolvePending).toBe(false);
  });

  it('allows both requests on a closed decision without pending', () => {
    const a = getAdminActions({
      currentUserId: INV, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'approved', isAnnulled: false, pendingRequest: null,
    });
    expect(a.canRequestAnnul).toBe(true);
    expect(a.canRequestDelete).toBe(true);
  });

  it('blocks annul once already annulled but still allows delete', () => {
    const a = getAdminActions({
      currentUserId: INV, ownerUserId: OWNER, investorUserId: INV,
      decisionStatus: 'approved', isAnnulled: true, pendingRequest: null,
    });
    expect(a.canRequestAnnul).toBe(false);
    expect(a.canRequestDelete).toBe(true);
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
    expect(a.canRequestDelete).toBe(false);
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
    expect(a.canRequestDelete).toBe(false);
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
    expect(computeContractDelta('annul', null)).toBe(0);
    expect(computeContractDelta('delete', undefined)).toBe(0);
    expect(computeContractDelta('annul', 0)).toBe(0);
  });

  it('reverses positive amendments for both types', () => {
    expect(computeContractDelta('annul', 5000)).toBe(-5000);
    expect(computeContractDelta('delete', 5000)).toBe(-5000);
  });

  it('reverses negative amendments (reductions become +)', () => {
    expect(computeContractDelta('annul', -800)).toBe(800);
    expect(computeContractDelta('delete', -800)).toBe(800);
  });
});
