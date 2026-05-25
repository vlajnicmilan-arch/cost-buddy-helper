import { describe, it, expect } from 'vitest';
import { getMilestoneDelay } from '../projectMilestoneDelay';

const today = new Date('2026-05-25');

describe('getMilestoneDelay', () => {
  it('completed exactly on due date → on_time', () => {
    const r = getMilestoneDelay(
      {
        status: 'completed',
        due_date: '2026-05-10',
        start_date: null,
        completed_at: null,
        actual_end_date: '2026-05-10',
      },
      today
    );
    expect(r).toEqual({ status: 'on_time', days: 0 });
  });

  it('completed 5 days late', () => {
    const r = getMilestoneDelay(
      {
        status: 'completed',
        due_date: '2026-05-10',
        start_date: null,
        completed_at: null,
        actual_end_date: '2026-05-15',
      },
      today
    );
    expect(r).toEqual({ status: 'late', days: 5 });
  });

  it('completed 3 days early', () => {
    const r = getMilestoneDelay(
      {
        status: 'completed',
        due_date: '2026-05-10',
        start_date: null,
        completed_at: null,
        actual_end_date: '2026-05-07',
      },
      today
    );
    expect(r).toEqual({ status: 'early', days: 3 });
  });

  it('completed without actual_end_date falls back to completed_at', () => {
    const r = getMilestoneDelay(
      {
        status: 'completed',
        due_date: '2026-05-10',
        start_date: null,
        completed_at: '2026-05-12T08:00:00Z',
        actual_end_date: null,
      },
      today
    );
    expect(r.status).toBe('late');
    expect(r.days).toBeGreaterThanOrEqual(1);
  });

  it('completed without any end → unknown', () => {
    const r = getMilestoneDelay(
      {
        status: 'completed',
        due_date: '2026-05-10',
        start_date: null,
        completed_at: null,
        actual_end_date: null,
      },
      today
    );
    expect(r.status).toBe('unknown');
  });

  it('in_progress past due_date → in_progress_late', () => {
    const r = getMilestoneDelay(
      {
        status: 'in_progress',
        due_date: '2026-05-20',
        start_date: '2026-05-01',
        completed_at: null,
      },
      today
    );
    expect(r).toEqual({ status: 'in_progress_late', days: 5 });
  });

  it('in_progress before due_date → on_time', () => {
    const r = getMilestoneDelay(
      {
        status: 'in_progress',
        due_date: '2026-06-01',
        start_date: '2026-05-01',
        completed_at: null,
      },
      today
    );
    expect(r).toEqual({ status: 'on_time', days: 0 });
  });

  it('pending past due_date → pending_late', () => {
    const r = getMilestoneDelay(
      {
        status: 'pending',
        due_date: '2026-05-20',
        start_date: '2026-05-01',
        completed_at: null,
      },
      today
    );
    expect(r).toEqual({ status: 'pending_late', days: 5 });
  });

  it('pending without dates → unknown', () => {
    const r = getMilestoneDelay(
      {
        status: 'pending',
        due_date: null,
        start_date: null,
        completed_at: null,
      },
      today
    );
    expect(r.status).toBe('unknown');
  });

  it('pending past start_date but no due_date → pending_late', () => {
    const r = getMilestoneDelay(
      {
        status: 'pending',
        due_date: null,
        start_date: '2026-05-10',
        completed_at: null,
      },
      today
    );
    expect(r).toEqual({ status: 'pending_late', days: 15 });
  });
});
