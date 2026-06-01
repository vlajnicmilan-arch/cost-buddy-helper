import { describe, it, expect } from 'vitest';
import {
  analyzeFairness,
  gini,
  type SnapshotRow,
  type MemberRow,
} from '../familySplitSuggestion';

const mkSnap = (
  member: string,
  period: string,
  owed: number,
): SnapshotRow => ({
  member_user_id: member,
  period_start: period,
  period_end: period.replace(/-01$/, '-28'),
  shared_total: owed * 2,
  share_ratio: 0.5,
  owed,
  paid: 0,
});

const mkMember = (id: string, consent = true): MemberRow => ({
  user_id: id,
  income_share_consent: consent,
});

describe('gini', () => {
  it('returns 0 for perfect equality', () => {
    expect(gini([10, 10, 10, 10])).toBeCloseTo(0, 5);
  });
  it('returns >0 for skewed distribution', () => {
    expect(gini([0, 0, 0, 100])).toBeGreaterThan(0.5);
  });
  it('returns 0 for empty / all-zero', () => {
    expect(gini([])).toBe(0);
    expect(gini([0, 0, 0])).toBe(0);
  });
  it('ignores negatives', () => {
    expect(gini([-5, 10, 10])).toBeCloseTo(gini([10, 10]), 5);
  });
});

describe('analyzeFairness', () => {
  const periods = ['2026-03-01', '2026-04-01', '2026-05-01'];

  it('returns insufficient_periods when <3 periods', () => {
    const snaps = [mkSnap('a', '2026-04-01', 100), mkSnap('b', '2026-04-01', 100)];
    const r = analyzeFairness(snaps, [mkMember('a'), mkMember('b')], 'equal');
    expect(r.suggestedMode).toBeNull();
    expect(r.reason).toBe('insufficient_periods');
  });

  it('returns single_member when <2 members', () => {
    const snaps = periods.map((p) => mkSnap('a', p, 100));
    const r = analyzeFairness(snaps, [mkMember('a')], 'equal');
    expect(r.reason).toBe('single_member');
  });

  it('returns manual_mode without touching it', () => {
    const snaps = periods.flatMap((p) => [mkSnap('a', p, 500), mkSnap('b', p, 100)]);
    const r = analyzeFairness(snaps, [mkMember('a'), mkMember('b')], 'manual');
    expect(r.suggestedMode).toBeNull();
    expect(r.reason).toBe('manual_mode');
  });

  it('suggests proportional when equal mode is skewed >25% and consent given', () => {
    const snaps = periods.flatMap((p) => [mkSnap('a', p, 800), mkSnap('b', p, 200)]);
    const r = analyzeFairness(snaps, [mkMember('a'), mkMember('b')], 'equal');
    expect(r.suggestedMode).toBe('proportional_income');
    expect(r.reason).toMatch(/^income_skew_/);
    expect(r.gini).toBeGreaterThan(0);
  });

  it('keeps equal mode when distribution is roughly balanced', () => {
    const snaps = periods.flatMap((p) => [mkSnap('a', p, 510), mkSnap('b', p, 490)]);
    const r = analyzeFairness(snaps, [mkMember('a'), mkMember('b')], 'equal');
    expect(r.suggestedMode).toBeNull();
    expect(r.reason).toBe('ok');
  });

  it('returns needs_consent if skewed but <2 members consented', () => {
    const snaps = periods.flatMap((p) => [mkSnap('a', p, 800), mkSnap('b', p, 200)]);
    const r = analyzeFairness(
      snaps,
      [mkMember('a', false), mkMember('b', false)],
      'equal',
    );
    expect(r.suggestedMode).toBeNull();
    expect(r.reason).toBe('needs_consent');
  });

  it('suggests reverting from proportional to equal when spend is balanced', () => {
    const snaps = periods.flatMap((p) => [mkSnap('a', p, 505), mkSnap('b', p, 495)]);
    const r = analyzeFairness(
      snaps,
      [mkMember('a'), mkMember('b')],
      'proportional_income',
    );
    expect(r.suggestedMode).toBe('equal');
    expect(r.reason).toBe('spend_balanced');
  });

  it('returns zero_activity when total owed is 0', () => {
    const snaps = periods.flatMap((p) => [mkSnap('a', p, 0), mkSnap('b', p, 0)]);
    const r = analyzeFairness(snaps, [mkMember('a'), mkMember('b')], 'equal');
    expect(r.reason).toBe('zero_activity');
  });
});
