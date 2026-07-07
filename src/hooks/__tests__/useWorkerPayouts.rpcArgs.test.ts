import { describe, it, expect } from 'vitest';
import {
  buildCreatePayoutRpcArgs,
  buildCreateBatchRpcArgs,
  type CreatePayoutInput,
  type CreateBatchInput,
} from '../useWorkerPayouts';

describe('buildCreatePayoutRpcArgs', () => {
  it('maps camelCase input to p_ SQL parameter names', () => {
    const input: CreatePayoutInput = {
      workerId: 'w1',
      projectId: 'p1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      paidAmount: 500,
      paymentSource: 'custom:src',
      paidAt: '2026-06-30T12:00:00.000Z',
      note: 'test',
      lockEntries: true,
    };
    expect(buildCreatePayoutRpcArgs(input)).toEqual({
      p_worker_id: 'w1',
      p_project_id: 'p1',
      p_period_start: '2026-06-01',
      p_period_end: '2026-06-30',
      p_paid_amount: 500,
      p_payment_source: 'custom:src',
      p_paid_at: '2026-06-30T12:00:00.000Z',
      p_note: 'test',
      p_lock_entries: true,
    });
  });

  it('defaults lockEntries to true and note to null when unset', () => {
    const input: CreatePayoutInput = {
      workerId: 'w', projectId: 'p',
      periodStart: '2026-01-01', periodEnd: '2026-01-31',
      paidAmount: 0, paymentSource: 'custom:x', paidAt: 'now',
    };
    const args = buildCreatePayoutRpcArgs(input);
    expect(args.p_note).toBeNull();
    expect(args.p_lock_entries).toBe(true);
  });
});

describe('buildCreateBatchRpcArgs', () => {
  it('flattens items to snake_case and preserves shared source', () => {
    const input: CreateBatchInput = {
      items: [
        { workerId: 'w1', projectId: 'p1', periodStart: '2026-06-01', periodEnd: '2026-06-30', paidAmount: 100 },
        { workerId: 'w2', projectId: 'p2', periodStart: '2026-06-01', periodEnd: '2026-06-30', paidAmount: 200 },
      ],
      paymentSource: 'custom:src',
      paidAt: '2026-06-30T12:00:00.000Z',
      note: 'batch note',
      lockEntries: true,
    };
    const args = buildCreateBatchRpcArgs(input);
    expect(args.p_payment_source).toBe('custom:src');
    expect(args.p_items).toHaveLength(2);
    expect(args.p_items[0]).toEqual({
      project_id: 'p1', worker_id: 'w1',
      period_start: '2026-06-01', period_end: '2026-06-30',
      paid_amount: 100,
    });
    expect(args.p_note).toBe('batch note');
    expect(args.p_lock_entries).toBe(true);
  });
});
