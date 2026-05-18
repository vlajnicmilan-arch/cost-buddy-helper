import { describe, it, expect } from 'vitest';
import { applyContractAmendment } from './projectCalculations';

/**
 * Regression tests for the contract baseline rule used when applying
 * scope-change amendments to a project. See useProjectMilestones.ts.
 *
 * The exact bug we're guarding against (project "Duje Grčić"):
 *   contract_value = null, total_budget = 30 000, two amendments (2400 + 640)
 *   were being added to 0 instead of 30 000 → resulting in 3 040 instead of 33 040.
 */
describe('applyContractAmendment (baseline rule)', () => {
  it('stacks amendment on top of existing contract_value when set', () => {
    expect(applyContractAmendment(30000, 30000, 2400)).toBe(32400);
  });

  it('uses total_budget as baseline when contract_value is null', () => {
    expect(applyContractAmendment(null, 30000, 2400)).toBe(32400);
  });

  it('uses total_budget as baseline when contract_value is 0', () => {
    expect(applyContractAmendment(0, 30000, 2400)).toBe(32400);
  });

  it('uses total_budget as baseline when contract_value is undefined', () => {
    expect(applyContractAmendment(undefined, 30000, 640)).toBe(30640);
  });

  it('reproduces the Duje Grčić scenario: two sequential amendments on null contract', () => {
    // 1st amendment: baseline = total_budget (30 000), +2 400 = 32 400 → contract_value bumped
    const afterFirst = applyContractAmendment(null, 30000, 2400);
    expect(afterFirst).toBe(32400);
    // 2nd amendment: contract_value is now 32 400, +640 = 33 040
    const afterSecond = applyContractAmendment(afterFirst, 30000, 640);
    expect(afterSecond).toBe(33040);
  });

  it('falls back to 0 when both contract_value and total_budget are missing', () => {
    expect(applyContractAmendment(null, null, 5000)).toBe(5000);
    expect(applyContractAmendment(0, 0, 1000)).toBe(1000);
  });

  it('handles negative amendments (scope reduction)', () => {
    expect(applyContractAmendment(30000, 30000, -5000)).toBe(25000);
  });

  it('clamps result at 0 when reduction exceeds baseline', () => {
    expect(applyContractAmendment(1000, 1000, -5000)).toBe(0);
  });

  it('parses string inputs from Supabase numeric columns', () => {
    expect(applyContractAmendment('30000', '30000', '2400')).toBe(32400);
    expect(applyContractAmendment(null, '30000', '640')).toBe(30640);
  });

  it('treats existing positive contract_value as authoritative even when total_budget is larger', () => {
    // Once contract_value is explicitly set, total_budget is irrelevant for baseline.
    expect(applyContractAmendment(10000, 50000, 1000)).toBe(11000);
  });
});
