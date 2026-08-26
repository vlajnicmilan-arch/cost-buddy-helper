import { describe, it, expect } from 'vitest';
import {
  normalizePersonName,
  suggestIdentityGroups,
  findExistingIdentityByName,
  aggregatePerson,
  sortPeopleRows,
  type EngagementRow,
  type PayoutRow,
} from '../workerIdentity';
import type { RateHistoryRow, WorkEntryForCost } from '../workerRateHistory';

const eng = (id: string, project: string, first: string, last: string, rate: number, workerId: string | null = null): EngagementRow => ({
  id,
  project_id: project,
  worker_id: workerId,
  first_name: first,
  last_name: last,
  position: 'radnik',
  hourly_rate: rate,
  business_profile_id: null,
});

describe('normalizePersonName', () => {
  it('strips diacritics, case and extra whitespace', () => {
    expect(normalizePersonName(' Petar ', 'Vlajnić')).toBe('petar vlajnic');
    expect(normalizePersonName('PETAR', 'VLAJNIC')).toBe('petar vlajnic');
    expect(normalizePersonName('Đuro', 'Šafarić')).toBe('duro safaric');
  });
});

describe('suggestIdentityGroups', () => {
  const rows = [
    eng('a', 'p1', 'Petar', 'Vlajnić', 10),
    eng('b', 'p2', 'petar', 'vlajnic', 12),
    eng('c', 'p3', 'Petar', 'Vlajnić', 15),
    eng('d', 'p1', 'Ivan', 'Padovan', 9),
    eng('e', 'p1', 'Already', 'Linked', 9, 'w-1'),
  ];

  it('groups by normalized name and flags multi-engagement groups', () => {
    const g = suggestIdentityGroups(rows);
    expect(g).toHaveLength(2);
    expect(g[0].engagementIds.sort()).toEqual(['a', 'b', 'c']);
    expect(g[0].needsConfirmation).toBe(true);
    expect(g[0].projectIds).toEqual(['p1', 'p2', 'p3']);
    expect(g[1].engagementIds).toEqual(['d']);
    expect(g[1].needsConfirmation).toBe(false);
  });

  it('ignores engagements that already have an identity', () => {
    expect(suggestIdentityGroups(rows).flatMap((g) => g.engagementIds)).not.toContain('e');
  });

  it('never groups across different business profiles', () => {
    const g = suggestIdentityGroups([
      { ...eng('a', 'p1', 'Petar', 'Vlajnić', 10), business_profile_id: 'bp1' },
      { ...eng('b', 'p2', 'Petar', 'Vlajnić', 10), business_profile_id: 'bp2' },
    ]);
    expect(g).toHaveLength(2);
    expect(g.every((x) => !x.needsConfirmation)).toBe(true);
  });
});

describe('findExistingIdentityByName', () => {
  const people = [
    { id: 'w1', first_name: 'Petar', last_name: 'Horvat', business_profile_id: null, archived_at: null },
    { id: 'w2', first_name: 'Ana', last_name: 'Anić', business_profile_id: 'bp1', archived_at: null },
    { id: 'w3', first_name: 'Old', last_name: 'Guy', business_profile_id: null, archived_at: '2026-01-01' },
  ];
  it('matches within the same business profile only', () => {
    expect(findExistingIdentityByName(people, 'petar', 'horvat', null)?.id).toBe('w1');
    expect(findExistingIdentityByName(people, 'Petar', 'Horvat', 'bp1')).toBeNull();
    expect(findExistingIdentityByName(people, 'Ana', 'Anic', 'bp1')?.id).toBe('w2');
  });
  it('ignores archived people and empty names', () => {
    expect(findExistingIdentityByName(people, 'Old', 'Guy', null)).toBeNull();
    expect(findExistingIdentityByName(people, '', '', null)).toBeNull();
  });
});

describe('aggregatePerson', () => {
  const engagements = [eng('e1', 'p1', 'Petar', 'V', 10, 'w1'), eng('e2', 'p2', 'Petar', 'V', 20, 'w1')];
  const entries: WorkEntryForCost[] = [
    { worker_id: 'e1', work_date: '2026-06-01', actual_hours: 10, payout_id: 'pay1' },
    { worker_id: 'e1', work_date: '2026-06-02', actual_hours: 5, payout_id: null },
    { worker_id: 'e2', work_date: '2026-06-03', actual_hours: 4, payout_id: null },
    { worker_id: 'other', work_date: '2026-06-03', actual_hours: 99, payout_id: null },
  ];
  const history: RateHistoryRow[] = [];
  const payouts: PayoutRow[] = [
    { worker_id: 'e1', project_id: 'p1', paid_amount: 100, paid_at: '2026-06-10T00:00:00Z' },
    { worker_id: 'e1', project_id: 'p1', paid_amount: 55, paid_at: '2026-06-11T00:00:00Z', voided_at: '2026-06-12' },
    { worker_id: 'other', project_id: 'p9', paid_amount: 999, paid_at: '2026-06-11T00:00:00Z' },
  ];

  it('sums hours, earnings and payouts only across this person engagements', () => {
    const a = aggregatePerson(engagements, entries, history, payouts, new Date('2026-07-01'));
    expect(a.engagementCount).toBe(2);
    expect(a.totalHours).toBe(19);
    expect(a.totalEarned).toBe(10 * 10 + 5 * 10 + 4 * 20);
    expect(a.totalRemaining).toBe(5 * 10 + 4 * 20);
    expect(a.totalPaid).toBe(100);
  });

  it('keeps the per-project breakdown separate (rate belongs to engagement)', () => {
    const a = aggregatePerson(engagements, entries, history, payouts, new Date('2026-07-01'));
    expect(a.byProject.map((b) => [b.projectId, b.hourlyRate, b.hours, b.earned])).toEqual([
      ['p1', 10, 15, 150],
      ['p2', 20, 4, 80],
    ]);
    // person total equals the sum of project totals, to the cent
    expect(a.totalEarned).toBe(a.byProject.reduce((s, b) => s + b.earned, 0));
  });

  it('keeps voided payouts visible in history but out of totalPaid', () => {
    const a = aggregatePerson(engagements, entries, history, payouts, new Date('2026-07-01'));
    expect(a.payouts).toHaveLength(2);
    expect(a.totalPaid).toBe(100);
  });

  it('excludes deleted payouts entirely', () => {
    const a = aggregatePerson(
      engagements,
      [],
      history,
      [{ worker_id: 'e1', project_id: 'p1', paid_amount: 42, paid_at: '2026-06-10', deleted_at: '2026-06-11' }],
    );
    expect(a.totalPaid).toBe(0);
    expect(a.payouts).toHaveLength(0);
  });
});

describe('sortPeopleRows', () => {
  it('sorts by remaining desc then name', () => {
    const rows = [
      { workerId: '1', firstName: 'B', lastName: 'B', engagementCount: 1, remaining: 0 },
      { workerId: '2', firstName: 'A', lastName: 'A', engagementCount: 1, remaining: 0 },
      { workerId: '3', firstName: 'C', lastName: 'C', engagementCount: 2, remaining: 500 },
    ];
    expect(sortPeopleRows(rows).map((r) => r.workerId)).toEqual(['3', '2', '1']);
  });
});

describe('aggregatePerson — remaining is measured in money, not in uncovered hours', () => {
  it('keeps the unpaid rest payable after a partial payout locked every hour', () => {
    const engagement = { id: 'e1', project_id: 'p1', worker_id: null, business_profile_id: null, first_name: 'Petar', last_name: 'V', hourly_rate: 10, position: '' };
    // 57.4 h × 10 €/h = 574 € earned, all hours locked by one 500 € payout.
    const entries = Array.from({ length: 10 }, (_, i) => ({
      worker_id: 'e1',
      work_date: `2026-07-0${(i % 9) + 1}`,
      actual_hours: 5.74,
      payout_id: 'pay1',
    }));
    const payouts = [
      {
        id: 'pay1',
        worker_id: 'e1',
        project_id: 'p1',
        gross_amount: 574,
        paid_amount: 500,
        paid_at: '2026-07-31T10:00:00Z',
        period_start: '2026-07-01',
        period_end: '2026-07-09',
      },
    ];
    const agg = aggregatePerson([engagement], entries, [], payouts);
    expect(agg.totalEarned).toBe(574);
    expect(agg.totalPaid).toBe(500);
    expect(agg.totalRemaining).toBe(74);
    expect(agg.totalAdvance).toBe(0);
    // The debt keeps a period even though no hour is free any more.
    expect(agg.byProject[0].unpaidFrom).toBe('2026-07-01');
    expect(agg.byProject[0].shortfalls).toEqual([
      { payoutId: 'pay1', periodStart: '2026-07-01', periodEnd: '2026-07-09', amount: 74 },
    ]);
  });

  it('shows an overpay as advance and never as negative remaining', () => {
    const engagement = { id: 'e1', project_id: 'p1', worker_id: null, business_profile_id: null, first_name: 'A', last_name: 'B', hourly_rate: 10, position: '' };
    const entries = [{ worker_id: 'e1', work_date: '2026-07-01', actual_hours: 10, payout_id: 'pay1' }];
    const payouts = [
      { id: 'pay1', worker_id: 'e1', project_id: 'p1', gross_amount: 100, paid_amount: 150, paid_at: '2026-07-02T10:00:00Z' },
    ];
    const agg = aggregatePerson([engagement], entries, [], payouts);
    expect(agg.totalRemaining).toBe(0);
    expect(agg.totalAdvance).toBe(50);
  });

  it('excludes voided payouts from paid and restores the debt', () => {
    const engagement = { id: 'e1', project_id: 'p1', worker_id: null, business_profile_id: null, first_name: 'A', last_name: 'B', hourly_rate: 10, position: '' };
    const entries = [{ worker_id: 'e1', work_date: '2026-07-01', actual_hours: 10, payout_id: null }];
    const payouts = [
      {
        id: 'pay1', worker_id: 'e1', project_id: 'p1', gross_amount: 100, paid_amount: 100,
        paid_at: '2026-07-02T10:00:00Z', status: 'voided', voided_at: '2026-07-03T10:00:00Z',
      },
    ];
    const agg = aggregatePerson([engagement], entries, [], payouts);
    expect(agg.totalPaid).toBe(0);
    expect(agg.totalRemaining).toBe(100);
  });
});
