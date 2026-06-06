import { describe, it, expect } from 'vitest';
import { isLiteProject } from '../isLiteProject';

const base = {
  contract_value: null,
  total_budget: 0,
  milestonesCount: 0,
  membersCount: 1,
  documentsCount: 0,
};

describe('isLiteProject', () => {
  it('empty project is lite', () => {
    expect(isLiteProject(base)).toBe(true);
  });

  it('creator-only (1 member) still counts as lite', () => {
    expect(isLiteProject({ ...base, membersCount: 1 })).toBe(true);
  });

  it('up to 3 milestones is still lite', () => {
    expect(isLiteProject({ ...base, milestonesCount: 3 })).toBe(true);
  });

  it('4 milestones is NOT lite', () => {
    expect(isLiteProject({ ...base, milestonesCount: 4 })).toBe(false);
  });

  it('any contract_value > 0 is NOT lite', () => {
    expect(isLiteProject({ ...base, contract_value: 1 })).toBe(false);
    expect(isLiteProject({ ...base, contract_value: 10000 })).toBe(false);
  });

  it('contract_value of 0 or null is lite', () => {
    expect(isLiteProject({ ...base, contract_value: 0 })).toBe(true);
    expect(isLiteProject({ ...base, contract_value: null })).toBe(true);
  });

  it('any total_budget > 0 is NOT lite', () => {
    expect(isLiteProject({ ...base, total_budget: 100 })).toBe(false);
  });

  it('total_budget undefined or 0 is lite', () => {
    expect(isLiteProject({ ...base, total_budget: 0 })).toBe(true);
    expect(isLiteProject({ ...base, total_budget: undefined as any })).toBe(true);
    expect(isLiteProject({ ...base, total_budget: null })).toBe(true);
  });

  it('2 or more members → NOT lite', () => {
    expect(isLiteProject({ ...base, membersCount: 2 })).toBe(false);
    expect(isLiteProject({ ...base, membersCount: 10 })).toBe(false);
  });

  it('any document → NOT lite', () => {
    expect(isLiteProject({ ...base, documentsCount: 1 })).toBe(false);
  });

  it('a fully loaded project is NOT lite', () => {
    expect(
      isLiteProject({
        contract_value: 50000,
        total_budget: 45000,
        milestonesCount: 10,
        membersCount: 3,
        documentsCount: 5,
      })
    ).toBe(false);
  });
});
