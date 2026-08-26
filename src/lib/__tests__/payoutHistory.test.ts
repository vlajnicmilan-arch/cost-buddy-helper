import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VISIBLE_PAYOUTS,
  groupPayoutsByMonth,
  hiddenPayoutCount,
  visiblePayouts,
  voidedPayouts,
} from '@/lib/payoutHistory';
import type { PayoutRow } from '@/lib/workerIdentity';

const p = (over: Partial<PayoutRow> & { paid_at: string }): PayoutRow => ({
  worker_id: 'w1',
  project_id: 'p1',
  paid_amount: 100,
  ...over,
});

describe('payoutHistory', () => {
  const rows: PayoutRow[] = [
    p({ id: '1', paid_at: '2026-08-01T10:00:00Z', paid_amount: 100 }),
    p({ id: '2', paid_at: '2026-08-10T10:00:00Z', paid_amount: 200 }),
    p({ id: '3', paid_at: '2026-08-20T10:00:00Z', paid_amount: 202 }),
    p({ id: '4', paid_at: '2026-07-05T10:00:00Z', paid_amount: 50 }),
    p({ id: '5', paid_at: '2026-07-06T10:00:00Z', paid_amount: 60 }),
    p({ id: '6', paid_at: '2026-06-06T10:00:00Z', paid_amount: 70 }),
    p({ id: 'v', paid_at: '2026-08-11T10:00:00Z', paid_amount: 999, status: 'voided', voided_at: '2026-08-12T10:00:00Z' }),
  ];

  it('collapses to the last five live payouts', () => {
    expect(visiblePayouts(rows, false)).toHaveLength(DEFAULT_VISIBLE_PAYOUTS);
    expect(hiddenPayoutCount(rows)).toBe(1);
    expect(visiblePayouts(rows, true)).toHaveLength(6);
  });

  it('never counts voided payouts as live', () => {
    expect(voidedPayouts(rows).map((r) => r.id)).toEqual(['v']);
    expect(visiblePayouts(rows, true).some((r) => r.id === 'v')).toBe(false);
  });

  it('groups by month with a month total, newest month first', () => {
    const g = groupPayoutsByMonth(rows);
    expect(g.map((x) => x.key)).toEqual(['2026-08', '2026-07', '2026-06']);
    expect(g[0].payouts).toHaveLength(3);
    expect(g[0].total).toBe(502);
    expect(g[1].total).toBe(110);
  });

  it('ignores unparsable dates', () => {
    expect(groupPayoutsByMonth([p({ id: 'x', paid_at: 'not-a-date' })])).toEqual([]);
  });
});
