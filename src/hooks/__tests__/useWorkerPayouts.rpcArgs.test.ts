import { describe, it, expect } from 'vitest';
import { buildCreatePayoutRpcArgs } from '../useWorkerPayouts';

describe('buildCreatePayoutRpcArgs', () => {
  const base = {
    workerId: 'w-1',
    projectId: 'p-1',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-07',
    paidAmount: 250.5,
    paymentSource: 'custom:aaaa',
    paidAt: '2026-07-07T12:00:00.000Z',
  };

  it('maps all camelCase fields to p_ prefixed RPC args (SQL contract)', () => {
    const out = buildCreatePayoutRpcArgs(base);
    expect(out).toEqual({
      p_worker_id: 'w-1',
      p_project_id: 'p-1',
      p_period_start: '2026-07-01',
      p_period_end: '2026-07-07',
      p_paid_amount: 250.5,
      p_payment_source: 'custom:aaaa',
      p_paid_at: '2026-07-07T12:00:00.000Z',
      p_note: null,
      p_lock_entries: true,
    });
  });

  it('note defaults to null when omitted', () => {
    expect(buildCreatePayoutRpcArgs(base).p_note).toBeNull();
  });

  it('passes non-empty note through', () => {
    expect(buildCreatePayoutRpcArgs({ ...base, note: 'srpanj' }).p_note).toBe('srpanj');
  });

  it('lockEntries defaults to true', () => {
    expect(buildCreatePayoutRpcArgs(base).p_lock_entries).toBe(true);
  });

  it('lockEntries=false is forwarded literally', () => {
    expect(buildCreatePayoutRpcArgs({ ...base, lockEntries: false }).p_lock_entries).toBe(false);
  });

  it('does NOT stringify numeric paid_amount (preserves numeric contract)', () => {
    const out = buildCreatePayoutRpcArgs({ ...base, paidAmount: 1234.56 });
    expect(typeof out.p_paid_amount).toBe('number');
    expect(out.p_paid_amount).toBe(1234.56);
  });
});
