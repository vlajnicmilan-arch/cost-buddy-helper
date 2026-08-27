import { describe, it, expect } from 'vitest';
import { summarizeProjectDeleteImpact } from '@/lib/projectDeleteImpact';

describe('summarizeProjectDeleteImpact', () => {
  it('sums only what is still owed', () => {
    const r = summarizeProjectDeleteImpact(
      [
        { engagementId: 'w1', earned: 100, paid: 40 },
        { engagementId: 'w2', earned: 50, paid: 50 },
      ],
      [{ collaboratorId: 'c1', agreed: 300, paid: 100 }],
    );
    expect(r.workerCount).toBe(2);
    expect(r.workerUnpaid).toBe(60);
    expect(r.collaboratorUnpaid).toBe(200);
    expect(r.hasDebt).toBe(true);
  });

  it('never turns an overpayment into a negative debt', () => {
    const r = summarizeProjectDeleteImpact([{ engagementId: 'w1', earned: 10, paid: 40 }], []);
    expect(r.workerUnpaid).toBe(0);
    expect(r.hasDebt).toBe(false);
  });

  it('ignores collaborators without an entered amount and cancelled ones', () => {
    const r = summarizeProjectDeleteImpact([], [
      { collaboratorId: 'c1', agreed: 0, paid: 0 },
      { collaboratorId: 'c2', agreed: 500, paid: 0, status: 'cancelled' },
    ]);
    expect(r.collaboratorCount).toBe(1);
    expect(r.collaboratorUnpaid).toBe(0);
    expect(r.hasDebt).toBe(false);
  });
});
