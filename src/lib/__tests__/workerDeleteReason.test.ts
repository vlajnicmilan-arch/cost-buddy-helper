import { describe, it, expect } from 'vitest';
import { parseWorkerDeleteError } from '@/lib/workerDeleteReason';

describe('parseWorkerDeleteError', () => {
  it('reads the payout count out of the RPC signal', () => {
    const r = parseWorkerDeleteError({ code: 'P0001', message: 'worker_has_payouts|5' });
    expect(r.kind).toBe('has_payouts');
    expect(r.payoutCount).toBe(5);
    expect(r.archivable).toBe(true);
  });

  it('recognises the raw FK violation on payouts', () => {
    const r = parseWorkerDeleteError({
      code: '23503',
      message: 'update or delete on table "project_workers" violates foreign key constraint',
      details: 'Key is still referenced from table "project_worker_payouts_worker_id_fkey".',
    });
    expect(r.kind).toBe('has_payouts');
    expect(r.archivable).toBe(true);
  });

  it('maps locked hours, ownership and missing worker', () => {
    expect(parseWorkerDeleteError({ code: 'P0001', message: 'worker_has_locked_entries' }).kind)
      .toBe('has_locked_entries');
    expect(parseWorkerDeleteError({ code: '42501', message: 'not_project_owner' }).kind)
      .toBe('not_owner');
    expect(parseWorkerDeleteError({ code: 'P0002', message: 'worker_not_found' }).kind)
      .toBe('not_found');
  });

  it('keeps the literal database code and message for diagnostics', () => {
    const r = parseWorkerDeleteError({ code: '42501', message: 'direct write forbidden' });
    expect(r.code).toBe('42501');
    expect(r.message).toBe('direct write forbidden');
  });

  it('never claims a transient failure for an unknown error', () => {
    const r = parseWorkerDeleteError({ code: 'XX000', message: 'boom' });
    expect(r.kind).toBe('unknown');
    expect(r.archivable).toBe(false);
  });
});
