import { describe, it, expect } from 'vitest';
import {
  initialSelection,
  payoutSummary,
  proposeScopedAllocation,
  selectAll,
} from '@/lib/personPayoutScope';
import type { EngagementObligation } from '@/lib/personPayout';

const eng = (id: string, projectId: string, remaining: number, from: string): EngagementObligation => ({
  engagementId: id,
  projectId,
  hours: 10,
  hourlyRate: 10,
  remaining,
  unpaidFrom: from,
  unpaidTo: from,
});

const rows = [eng('a', 'pA', 100, '2026-05-01'), eng('b', 'pB', 50, '2026-03-01')];

describe('personPayoutScope', () => {
  it('project scope selects only that project', () => {
    expect([...initialSelection(rows, 'pA')]).toEqual(['a']);
    expect([...initialSelection(rows, null)].sort()).toEqual(['a', 'b']);
  });

  it('scoped FIFO never touches unselected engagements', () => {
    expect(proposeScopedAllocation(rows, initialSelection(rows, 'pA'), 120)).toEqual({ a: 100 });
    expect(proposeScopedAllocation(rows, selectAll(rows), 120)).toEqual({ b: 50, a: 70 });
  });

  it('summary uses selected engagements', () => {
    expect(payoutSummary(rows, new Set(['a']), { a: 150, b: 50 }, 30)).toEqual({
      paying: 30,
      earned: 150,
      remaining: 70,
    });
    expect(payoutSummary(rows, new Set(['a']), { a: 150 }, 500).remaining).toBe(0);
  });
});
