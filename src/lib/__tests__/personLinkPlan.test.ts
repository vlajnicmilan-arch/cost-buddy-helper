import { describe, expect, it } from 'vitest';
import {
  pickInviteCarrier,
  planPersonLink,
  planPersonUnlink,
  skippedProjectNames,
  type EngagementLink,
} from '@/lib/personLinkPlan';

const U = 'user-1';

const eng = (over: Partial<EngagementLink> & { id: string }): EngagementLink => ({
  projectId: 'p1',
  userId: null,
  ...over,
});

describe('planPersonLink', () => {
  it('links every engagement of the person', () => {
    const plan = planPersonLink(
      [eng({ id: 'a', projectId: 'p1' }), eng({ id: 'b', projectId: 'p2' }), eng({ id: 'c', projectId: 'p3' })],
      U,
    );
    expect(plan.toLink).toEqual(['a', 'b', 'c']);
    expect(plan.skipped).toEqual([]);
  });

  it('skips only the conflicting project and keeps the rest', () => {
    const plan = planPersonLink(
      [
        eng({ id: 'a', projectId: 'p1' }),
        eng({ id: 'other', projectId: 'p2', userId: U }),
        eng({ id: 'b', projectId: 'p2' }),
        eng({ id: 'c', projectId: 'p3' }),
      ],
      U,
    );
    expect(plan.toLink).toEqual(['a', 'c']);
    expect(plan.alreadyLinked).toEqual(['other']);
    expect(plan.skipped).toEqual([{ engagementId: 'b', projectId: 'p2', existingEngagementId: 'other' }]);
  });

  it('treats an engagement already carrying the account as done', () => {
    const plan = planPersonLink([eng({ id: 'a', userId: U })], U);
    expect(plan.toLink).toEqual([]);
    expect(plan.alreadyLinked).toEqual(['a']);
  });

  it('replaces a different account on the same engagement', () => {
    const plan = planPersonLink([eng({ id: 'a', userId: 'other-user' })], U);
    expect(plan.toLink).toEqual(['a']);
  });
});

describe('planPersonUnlink', () => {
  it('clears every engagement that carried an account', () => {
    expect(
      planPersonUnlink([eng({ id: 'a', userId: U }), eng({ id: 'b' }), eng({ id: 'c', userId: U })]),
    ).toEqual(['a', 'c']);
  });

  it('is a no-op when nothing was linked', () => {
    expect(planPersonUnlink([eng({ id: 'a' })])).toEqual([]);
  });
});

describe('pickInviteCarrier', () => {
  it('picks the newest active engagement', () => {
    const carrier = pickInviteCarrier([
      eng({ id: 'a', projectId: 'p1', createdAt: '2026-01-01' }),
      eng({ id: 'b', projectId: 'p2', createdAt: '2026-05-01' }),
    ]);
    expect(carrier?.id).toBe('b');
  });

  it('ignores archived engagements and those without a project', () => {
    const carrier = pickInviteCarrier([
      eng({ id: 'a', projectId: 'p1', createdAt: '2026-01-01' }),
      eng({ id: 'b', projectId: 'p2', createdAt: '2026-09-01', archived: true }),
      eng({ id: 'c', projectId: null, createdAt: '2026-10-01' }),
    ]);
    expect(carrier?.id).toBe('a');
  });

  it('returns null when there is nothing to invite from', () => {
    expect(pickInviteCarrier([])).toBeNull();
  });
});

describe('skippedProjectNames', () => {
  it('names the skipped projects', () => {
    expect(
      skippedProjectNames(
        [{ engagementId: 'b', projectId: 'p2', existingEngagementId: 'other' }],
        { p2: 'Vila Mare' },
        'Projekt',
      ),
    ).toEqual(['Vila Mare']);
  });

  it('accepts plain project ids returned by the database', () => {
    expect(skippedProjectNames(['p9'], {}, 'Projekt')).toEqual(['Projekt']);
  });
});
