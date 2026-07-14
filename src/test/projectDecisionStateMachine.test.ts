import { describe, it, expect } from 'vitest';
import {
  getLegalActions,
  nextStatusAfter,
  decisionPhaseKey,
  type DecisionCore,
  type DecisionStep,
  type NextStepContext,
} from '@/lib/projectDecisionStateMachine';

const OWNER = 'owner-uid';
const INVESTOR = 'investor-uid';
const OTHER = 'random-uid';

const baseDecision = (overrides: Partial<DecisionCore> = {}): DecisionCore => ({
  id: 'd1',
  created_by: OWNER,
  current_status: 'awaiting_response',
  closed_reason: null,
  ...overrides,
});

const ctx = (currentUserId: string): NextStepContext => ({
  currentUserId, ownerUserId: OWNER, investorUserId: INVESTOR,
});

const step = (n: number, actor: string, action: DecisionStep['action']): DecisionStep => ({
  step_no: n, actor_user_id: actor, actor_role: actor === OWNER ? 'owner' : 'investor', action,
});

describe('projectDecisionStateMachine', () => {
  describe('nextStatusAfter', () => {
    it('accept → approved / accepted', () => {
      expect(nextStatusAfter('accept')).toEqual({ status: 'approved', closed_reason: 'accepted' });
    });
    it('reject → rejected / rejected', () => {
      expect(nextStatusAfter('reject')).toEqual({ status: 'rejected', closed_reason: 'rejected' });
    });
    it('counter/correction/propose → awaiting_response', () => {
      for (const a of ['counter', 'correction', 'propose'] as const) {
        expect(nextStatusAfter(a).status).toBe('awaiting_response');
      }
    });
  });

  describe('getLegalActions — strogi ciklus', () => {
    it('nakon propose: druga strana (investor) može accept/reject/counter', () => {
      const steps = [step(1, OWNER, 'propose')];
      const legal = getLegalActions(baseDecision(), steps, ctx(INVESTOR));
      expect(legal).toMatchObject({ canAccept: true, canReject: true, canCounter: true, canCorrect: false, isFinalRound: false });
    });

    it('nakon propose: pošiljatelj (owner) NEMA akcija', () => {
      const steps = [step(1, OWNER, 'propose')];
      const legal = getLegalActions(baseDecision(), steps, ctx(OWNER));
      expect(legal).toMatchObject({ canAccept: false, canReject: false, canCounter: false, canCorrect: false });
    });

    it('nakon counter: originalni predlagač ima JOŠ 1 korekciju', () => {
      const steps = [step(1, OWNER, 'propose'), step(2, INVESTOR, 'counter')];
      const legal = getLegalActions(baseDecision(), steps, ctx(OWNER));
      expect(legal).toMatchObject({ canCorrect: true, hasOneCorrectionLeft: true });
      expect(legal.canAccept).toBe(false);
      expect(legal.canReject).toBe(false);
    });

    it('nakon correction: druga strana ima KONAČNU odluku (accept/reject, bez counter)', () => {
      const steps = [
        step(1, OWNER, 'propose'),
        step(2, INVESTOR, 'counter'),
        step(3, OWNER, 'correction'),
      ];
      const legal = getLegalActions(baseDecision(), steps, ctx(INVESTOR));
      expect(legal).toMatchObject({ canAccept: true, canReject: true, canCounter: false, isFinalRound: true });
    });

    it('random user nikad nema akcija', () => {
      const steps = [step(1, OWNER, 'propose')];
      const legal = getLegalActions(baseDecision(), steps, ctx(OTHER));
      expect(legal.canAccept || legal.canReject || legal.canCounter || legal.canCorrect).toBe(false);
    });

    it('accept zatvara odluku — nema više akcija', () => {
      const steps = [step(1, OWNER, 'propose'), step(2, INVESTOR, 'accept')];
      const legal = getLegalActions(
        baseDecision({ current_status: 'approved', closed_reason: 'accepted' }),
        steps,
        ctx(OWNER),
      );
      expect(legal.isClosed).toBe(true);
      expect(legal.canAccept).toBe(false);
    });

    it('investor može biti kreator: nakon njegovog propose, owner odgovara', () => {
      const dec = baseDecision({ created_by: INVESTOR });
      const steps = [step(1, INVESTOR, 'propose')];
      const legal = getLegalActions(dec, steps, ctx(OWNER));
      expect(legal).toMatchObject({ canAccept: true, canReject: true, canCounter: true });
    });
  });

  describe('decisionPhaseKey', () => {
    it('otvoreno bez koraka → awaiting', () => {
      expect(decisionPhaseKey(baseDecision(), [])).toBe('awaiting');
    });
    it('nakon counter → has_one_correction', () => {
      expect(decisionPhaseKey(baseDecision(), [step(1, OWNER, 'propose'), step(2, INVESTOR, 'counter')])).toBe('has_one_correction');
    });
    it('nakon correction → final_round', () => {
      expect(decisionPhaseKey(baseDecision(), [
        step(1, OWNER, 'propose'), step(2, INVESTOR, 'counter'), step(3, OWNER, 'correction'),
      ])).toBe('final_round');
    });
    it('approved status → approved', () => {
      expect(decisionPhaseKey(baseDecision({ current_status: 'approved' }), [])).toBe('approved');
    });
    it('rejected status → rejected', () => {
      expect(decisionPhaseKey(baseDecision({ current_status: 'rejected' }), [])).toBe('rejected');
    });
  });
});
