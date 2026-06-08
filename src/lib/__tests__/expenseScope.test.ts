import { describe, it, expect } from 'vitest';
import {
  buildExpenseScopeFilter,
  belongsToMyScope,
  type ScopeContext,
} from '@/lib/expenseScope';

const UID_PETAR = 'petar-uid';
const UID_MILAN = 'milan-uid';
const SHARED_S1 = 'shared-source-1';
const SHARED_S2 = 'shared-source-2';

const ctxPetarSolo: ScopeContext = {
  userId: UID_PETAR,
  sharedPaymentSourceIds: new Set(),
};

const ctxPetarWithShared: ScopeContext = {
  userId: UID_PETAR,
  sharedPaymentSourceIds: new Set([SHARED_S1, SHARED_S2]),
};

describe('buildExpenseScopeFilter', () => {
  it('returns null when no user', () => {
    expect(buildExpenseScopeFilter(null)).toBeNull();
    expect(buildExpenseScopeFilter({ userId: '', sharedPaymentSourceIds: new Set() })).toBeNull();
  });

  it('solo user → only user_id.eq', () => {
    expect(buildExpenseScopeFilter(ctxPetarSolo)).toBe(`user_id.eq.${UID_PETAR}`);
  });

  it('shared sources → includes payment_source.in and income_source_id.in', () => {
    const out = buildExpenseScopeFilter(ctxPetarWithShared);
    expect(out).toContain(`user_id.eq.${UID_PETAR}`);
    expect(out).toContain(`payment_source.in.(custom:${SHARED_S1},custom:${SHARED_S2})`);
    expect(out).toContain(`income_source_id.in.(${SHARED_S1},${SHARED_S2})`);
  });

  it('produces a comma-separated PostgREST or() argument', () => {
    const out = buildExpenseScopeFilter(ctxPetarWithShared)!;
    // Three top-level branches: user_id, payment_source, income_source_id
    expect(out.split(/,(?![^()]*\))/g).length).toBe(3);
  });
});

describe('belongsToMyScope — P0 regression (project membership leak)', () => {
  it('Petar (worker) does NOT see Milan-authored project transaction', () => {
    // Milan owns a project P, Petar is a member/worker on P.
    // Milan logs a project expense paid from Milan's personal source.
    // RLS lets Petar's SELECT see it through is_project_member.
    // Client-side scope MUST reject it.
    const milanProjectExpense = {
      user_id: UID_MILAN,
      payment_source: 'cash',
      income_source_id: null,
      type: 'expense',
    };
    expect(belongsToMyScope(milanProjectExpense, ctxPetarSolo)).toBe(false);
    expect(belongsToMyScope(milanProjectExpense, ctxPetarWithShared)).toBe(false);
  });

  it('foreign user expense without shared source → reject', () => {
    expect(
      belongsToMyScope(
        { user_id: UID_MILAN, payment_source: 'cash', type: 'expense' },
        ctxPetarSolo,
      ),
    ).toBe(false);
  });
});

describe('belongsToMyScope — shared source flow stays intact', () => {
  it('accepts foreign expense on a shared source the user has access to', () => {
    expect(
      belongsToMyScope(
        {
          user_id: UID_MILAN,
          payment_source: `custom:${SHARED_S1}`,
          type: 'expense',
        },
        ctxPetarWithShared,
      ),
    ).toBe(true);
  });

  it('accepts foreign transfer when destination is one of my shared sources', () => {
    expect(
      belongsToMyScope(
        {
          user_id: UID_MILAN,
          payment_source: 'cash',
          income_source_id: SHARED_S2,
          type: 'transfer',
        },
        ctxPetarWithShared,
      ),
    ).toBe(true);
  });

  it('rejects foreign expense on a source I do NOT share', () => {
    expect(
      belongsToMyScope(
        {
          user_id: UID_MILAN,
          payment_source: 'custom:some-other-source',
          type: 'expense',
        },
        ctxPetarWithShared,
      ),
    ).toBe(false);
  });
});

describe('belongsToMyScope — own transactions', () => {
  it('accepts own expense regardless of source', () => {
    expect(
      belongsToMyScope(
        { user_id: UID_PETAR, payment_source: 'cash', type: 'expense' },
        ctxPetarSolo,
      ),
    ).toBe(true);
  });

  it('rejects null/undefined row defensively', () => {
    expect(belongsToMyScope(null, ctxPetarWithShared)).toBe(false);
    expect(belongsToMyScope(undefined, ctxPetarWithShared)).toBe(false);
  });

  it('rejects when no auth context', () => {
    expect(belongsToMyScope({ user_id: UID_PETAR }, null)).toBe(false);
  });
});
