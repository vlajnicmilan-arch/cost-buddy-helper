import { describe, it, expect } from 'vitest';
import { getMilestoneDecisionBadge } from '@/lib/milestoneDecisionSource';

const base = { source_decision_id: null, source_decision: null, investor_price: null };

describe('milestoneDecisionSource', () => {
  it('faza bez source_decision_id → none', () => {
    expect(getMilestoneDecisionBadge(base).kind).toBe('none');
  });

  it('faza s aktivnom (ne-poništenom) odlukom → from_decision + investor_price', () => {
    const r = getMilestoneDecisionBadge({
      source_decision_id: 'd1',
      investor_price: 2400,
      source_decision: { id: 'd1', title: 'X', annulled_at: null },
    });
    expect(r).toEqual({ kind: 'from_decision', decisionId: 'd1', investorPrice: 2400 });
  });

  it('faza s poništenom odlukom → from_annulled_decision (faza ostaje, samo badge)', () => {
    const r = getMilestoneDecisionBadge({
      source_decision_id: 'd1',
      investor_price: 2400,
      source_decision: { id: 'd1', title: 'X', annulled_at: '2026-07-15T10:00:00Z' },
    });
    expect(r.kind).toBe('from_annulled_decision');
    if (r.kind === 'from_annulled_decision') expect(r.investorPrice).toBe(2400);
  });

  it('investor_price null se propagira kao null', () => {
    const r = getMilestoneDecisionBadge({
      source_decision_id: 'd1',
      investor_price: null,
      source_decision: { id: 'd1', title: 'X', annulled_at: null },
    });
    expect(r.kind).toBe('from_decision');
    if (r.kind === 'from_decision') expect(r.investorPrice).toBeNull();
  });

  it('source_decision izostavljen (samo id) tretira se kao aktivan (nema annulled_at)', () => {
    const r = getMilestoneDecisionBadge({
      source_decision_id: 'd1',
      investor_price: 1000,
      source_decision: null,
    });
    expect(r.kind).toBe('from_decision');
  });
});

/**
 * Poslovna pravila stroja: "kada trigger stvara fazu"
 * (mirror server-side project_decision_step_after — čista logika za testabilnost).
 */
export function shouldCreateMilestoneFromDecision(input: {
  action: 'accept' | 'reject' | 'counter' | 'correction' | 'propose';
  effectivePrice: number | null;
  alreadyHasAmendment: boolean;
}): boolean {
  if (input.action !== 'accept') return false;
  if (input.alreadyHasAmendment) return false; // idempotencija: amendment već postoji
  if (input.effectivePrice == null) return false;
  if (input.effectivePrice <= 0) return false;  // samo pozitivna cijena
  return true;
}

describe('shouldCreateMilestoneFromDecision — trigger business rules', () => {
  it('accept + pozitivna cijena + nema amendmenta → TRUE', () => {
    expect(shouldCreateMilestoneFromDecision({ action: 'accept', effectivePrice: 2400, alreadyHasAmendment: false })).toBe(true);
  });
  it('accept + negativna cijena → FALSE (odustajanje ne stvara fazu)', () => {
    expect(shouldCreateMilestoneFromDecision({ action: 'accept', effectivePrice: -500, alreadyHasAmendment: false })).toBe(false);
  });
  it('accept + cijena 0/null → FALSE', () => {
    expect(shouldCreateMilestoneFromDecision({ action: 'accept', effectivePrice: 0, alreadyHasAmendment: false })).toBe(false);
    expect(shouldCreateMilestoneFromDecision({ action: 'accept', effectivePrice: null, alreadyHasAmendment: false })).toBe(false);
  });
  it('reject/counter/correction/propose → FALSE (samo approved zatvara ciklus)', () => {
    for (const a of ['reject','counter','correction','propose'] as const) {
      expect(shouldCreateMilestoneFromDecision({ action: a, effectivePrice: 2400, alreadyHasAmendment: false })).toBe(false);
    }
  });
  it('idempotencija: amendment već postoji → FALSE', () => {
    expect(shouldCreateMilestoneFromDecision({ action: 'accept', effectivePrice: 2400, alreadyHasAmendment: true })).toBe(false);
  });
});
