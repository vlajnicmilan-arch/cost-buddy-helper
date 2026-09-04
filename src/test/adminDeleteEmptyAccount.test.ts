import { describe, it, expect } from 'vitest';
import { evaluateDeletionGuards, type EmptinessReport } from '../../supabase/functions/admin-delete-empty-user/guards';
import { formatBlockerReason, topBlockers } from '@/lib/adminEmptyAccount';

const base: EmptinessReport = {
  user_id: '00000000-0000-0000-0000-000000000001',
  empty: true,
  blockers: [],
  is_admin: false,
  is_self: false,
  checked_tables: ['expenses', 'projects'],
  checked_count: 2,
  checked_at: '2026-09-04T00:00:00Z',
};

describe('evaluateDeletionGuards', () => {
  it('allows deleting an empty, non-admin, non-self account', () => {
    expect(evaluateDeletionGuards(base, 'delete')).toEqual({ allowed: true, status: 200 });
  });

  it('refuses self-deletion even in check mode', () => {
    expect(evaluateDeletionGuards({ ...base, is_self: true }, 'check')).toEqual({
      allowed: false,
      error: 'cannot_delete_self',
      status: 403,
    });
  });

  it('refuses deleting another admin', () => {
    expect(evaluateDeletionGuards({ ...base, is_admin: true }, 'delete')).toEqual({
      allowed: false,
      error: 'cannot_delete_admin',
      status: 403,
    });
  });

  it('refuses a non-empty account', () => {
    const report = {
      ...base,
      empty: false,
      blockers: [{ table: 'expenses', count: 12 }],
    };
    expect(evaluateDeletionGuards(report, 'delete')).toEqual({
      allowed: false,
      error: 'account_not_empty',
      status: 409,
    });
  });

  it('check mode reports a non-empty account without refusing', () => {
    expect(evaluateDeletionGuards({ ...base, empty: false }, 'check').allowed).toBe(true);
  });
});

describe('blocker formatting', () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    `${key}:${opts?.count ?? ''}${opts?.reason ? `|${opts.reason}` : ''}`;

  it('sorts blockers by count desc', () => {
    const sorted = topBlockers([
      { table: 'projects', count: 2 },
      { table: 'expenses', count: 12 },
    ]);
    expect(sorted[0].table).toBe('expenses');
  });

  it('summarises the biggest reasons and counts the rest', () => {
    const out = formatBlockerReason(
      [
        { table: 'expenses', count: 12 },
        { table: 'projects', count: 2 },
        { table: 'clients', count: 1 },
        { table: 'workers', count: 1 },
      ],
      t,
    );
    expect(out).toContain('admin.emptyAccount.entity.expenses:12');
    expect(out).toContain('admin.emptyAccount.reasonMore');
  });

  it('falls back to the raw table name for unlabelled tables', () => {
    expect(formatBlockerReason([{ table: 'some_new_table', count: 3 }], t)).toBe('3 × some_new_table');
  });

  it('labels an active paid subscription', () => {
    expect(
      formatBlockerReason([{ table: 'user_entitlements', count: 1, kind: 'paid_subscription' }], t),
    ).toContain('paidSubscription');
  });
});
