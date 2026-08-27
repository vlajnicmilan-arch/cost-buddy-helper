import { describe, it, expect } from 'vitest';
import {
  buildPersonRenamePlan,
  summarizePersonDeleteImpact,
  type PersonEngagementFact,
} from '@/lib/personDeleteImpact';

const engagements: PersonEngagementFact[] = [
  { engagementId: 'e1', projectId: 'p1', hours: 8, earned: 80, paid: 30 },
  { engagementId: 'e2', projectId: 'p1', hours: 2, earned: 20, paid: 0 },
  { engagementId: 'e3', projectId: 'p2', hours: 5, earned: 50, paid: 50 },
];

describe('summarizePersonDeleteImpact', () => {
  it('counts engagements and distinct projects', () => {
    const r = summarizePersonDeleteImpact(engagements);
    expect(r.engagementCount).toBe(3);
    expect(r.projectCount).toBe(2);
    expect(r.hours).toBe(15);
    expect(r.earned).toBe(150);
    expect(r.paid).toBe(80);
  });

  it('flags the account link only when one exists', () => {
    expect(summarizePersonDeleteImpact(engagements).cutsAccountLink).toBe(false);
    expect(summarizePersonDeleteImpact(engagements, { linkedUserId: 'u1' }).cutsAccountLink).toBe(true);
  });

  it('handles a person without engagements', () => {
    const r = summarizePersonDeleteImpact([]);
    expect(r).toMatchObject({ engagementCount: 0, projectCount: 0, hours: 0, earned: 0, paid: 0 });
  });
});

describe('buildPersonRenamePlan', () => {
  it('trims and detects change', () => {
    const p = buildPersonRenamePlan({ firstName: '  Ivan ', lastName: ' Horvat ' }, { firstName: 'Ivan', lastName: 'Perić' });
    expect(p).toMatchObject({ valid: true, firstName: 'Ivan', lastName: 'Horvat', changed: true });
  });

  it('is invalid without a first name', () => {
    expect(buildPersonRenamePlan({ firstName: '   ', lastName: 'X' }, { firstName: 'A', lastName: 'B' }).valid).toBe(false);
  });

  it('reports no change when nothing moved', () => {
    expect(
      buildPersonRenamePlan({ firstName: 'Ivan', lastName: 'Horvat' }, { firstName: 'Ivan', lastName: 'Horvat' }).changed,
    ).toBe(false);
  });
});
