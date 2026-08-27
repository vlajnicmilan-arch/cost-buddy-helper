import { describe, it, expect } from 'vitest';
import { payoutGuardKind, PAYOUT_GUARD_I18N_KEY } from '../payoutExpenseGuard';

describe('payoutGuardKind', () => {
  it('recognises the collaborator payment guard on DELETE', () => {
    expect(
      payoutGuardKind({
        code: '42501',
        message:
          'expenses: direct DELETE forbidden for collaborator payment expense (id=abc). Use void_collaborator_payment RPC.',
      }),
    ).toBe('collaborator');
  });

  it('recognises the collaborator payment guard on field mutation', () => {
    expect(
      payoutGuardKind({
        message:
          'expenses: field mutation forbidden for collaborator payment expense (id=abc). Use void_collaborator_payment RPC.',
      }),
    ).toBe('collaborator');
  });

  it('recognises the worker payout guard', () => {
    expect(
      payoutGuardKind(
        'expenses: direct DELETE forbidden for owner payout expense (id=abc). Use void_worker_payout RPC.',
      ),
    ).toBe('worker');
  });

  it('returns null for unrelated permission errors', () => {
    expect(payoutGuardKind({ code: '42501', message: 'permission denied for table expenses' })).toBeNull();
    expect(payoutGuardKind(null)).toBeNull();
  });

  it('maps both kinds to distinct i18n keys', () => {
    expect(PAYOUT_GUARD_I18N_KEY.worker).not.toBe(PAYOUT_GUARD_I18N_KEY.collaborator);
  });
});
