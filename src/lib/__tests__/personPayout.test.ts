import { describe, it, expect } from 'vitest';
import {
  allocateFifo,
  buildPersonPayoutRpcArgs,
  payableObligations,
  totalRemaining,
  validateAllocation,
  type EngagementObligation,
} from '@/lib/personPayout';

const eng = (
  id: string,
  remaining: number,
  from: string | null,
  to: string | null,
  projectId: string | null = `p-${id}`,
): EngagementObligation => ({
  engagementId: id,
  projectId,
  hours: 10,
  hourlyRate: 10,
  remaining,
  unpaidFrom: from,
  unpaidTo: to,
});

describe('payableObligations', () => {
  it('drops settled engagements and sorts oldest unpaid work first', () => {
    const rows = [
      eng('b', 100, '2026-05-01', '2026-05-10'),
      eng('a', 50, '2026-03-01', '2026-03-05'),
      eng('c', 0, '2026-01-01', '2026-01-02'),
      eng('d', 80, null, null),
    ];
    expect(payableObligations(rows).map((o) => o.engagementId)).toEqual(['a', 'b']);
    expect(totalRemaining(rows)).toBe(150);
  });
});

describe('allocateFifo', () => {
  it('fills the oldest obligation first', () => {
    const rows = [eng('new', 200, '2026-06-01', '2026-06-10'), eng('old', 120, '2026-02-01', '2026-02-10')];
    expect(allocateFifo(rows, 150)).toEqual({ old: 120, new: 30 });
  });

  it('never proposes more than what remains in total', () => {
    const rows = [eng('a', 100, '2026-01-01', '2026-01-05')];
    expect(allocateFifo(rows, 500)).toEqual({ a: 100 });
  });

  it('returns nothing for a zero amount', () => {
    expect(allocateFifo([eng('a', 100, '2026-01-01', '2026-01-05')], 0)).toEqual({});
  });
});

describe('validateAllocation', () => {
  const rows = [eng('a', 100, '2026-01-01', '2026-01-05'), eng('b', 50, '2026-02-01', '2026-02-05')];

  it('accepts a split that matches the amount', () => {
    const v = validateAllocation(rows, { a: 100, b: 20 }, 120);
    expect(v.ok).toBe(true);
    expect(v.unallocated).toBe(0);
  });

  it('rejects an advance on a single engagement', () => {
    const v = validateAllocation(rows, { a: 130 }, 130);
    expect(v.ok).toBe(false);
    expect(v.overAllocated).toEqual(['a']);
  });

  it('rejects an amount larger than everything that remains', () => {
    const v = validateAllocation(rows, { a: 100, b: 50 }, 200);
    expect(v.exceedsTotal).toBe(true);
    expect(v.ok).toBe(false);
  });

  it('rejects a split that does not add up to the amount', () => {
    const v = validateAllocation(rows, { a: 40 }, 100);
    expect(v.ok).toBe(false);
    expect(v.unallocated).toBe(60);
  });
});

describe('buildPersonPayoutRpcArgs', () => {
  it('maps only positive allocations, using each engagement unpaid period', () => {
    const rows = [eng('a', 100, '2026-01-01', '2026-01-05'), eng('b', 50, '2026-02-01', '2026-02-05')];
    const args = buildPersonPayoutRpcArgs({
      obligations: rows,
      allocation: { a: 100, b: 0 },
      paymentSource: 'custom:src',
      paidAt: '2026-03-01T10:00:00.000Z',
      note: 'isplata',
    });
    expect(args.p_items).toEqual([
      {
        project_id: 'p-a',
        worker_id: 'a',
        period_start: '2026-01-01',
        period_end: '2026-01-05',
        paid_amount: 100,
      },
    ]);
    expect(args.p_payment_source).toBe('custom:src');
    expect(args.p_lock_entries).toBe(true);
    expect(args.p_note).toBe('isplata');
  });
});
