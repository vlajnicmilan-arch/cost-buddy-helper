import { describe, it, expect } from 'vitest';
import { applySharedAccessFilter, isSharedRowVisible } from '../sharedAccessScope';

const ME = 'me-0000-0000';
const OTHER = 'other-0000-0000';
const SHARED = 'd5f87bf1-e9ac-4a60-a201-44db6fe4d3ca';
const SHARED_FULL = 'full-0000-0000-0000';
const MINE = 'mine-0000-0000-0000';

const ctx = {
  userId: ME,
  sharedPaymentSourceIds: new Set([SHARED, SHARED_FULL, MINE]),
  fullAccessSourceIds: new Set([SHARED_FULL, MINE]),
};

const row = (over: Record<string, unknown> = {}) => ({
  user_id: ME,
  payment_source: `custom:${SHARED}`,
  type: 'expense',
  income_source_id: null,
  ...over,
});

describe('sharedAccessScope', () => {
  it('vlastiti redak na dijeljenom novčaniku ulazi u statistike', () => {
    expect(isSharedRowVisible(row(), ctx)).toBe(true);
  });

  it('tuđi redak na dijeljenom novčaniku bez uloge full NE ulazi', () => {
    expect(isSharedRowVisible(row({ user_id: OTHER }), ctx)).toBe(false);
  });

  it('tuđi redak na novčaniku s ulogom full ulazi', () => {
    expect(
      isSharedRowVisible(row({ user_id: OTHER, payment_source: `custom:${SHARED_FULL}` }), ctx),
    ).toBe(true);
  });

  it('tuđi prijenos U dijeljeni novčanik bez full NE ulazi', () => {
    const transferIn = row({ user_id: OTHER, payment_source: 'cash', type: 'transfer', income_source_id: SHARED });
    expect(isSharedRowVisible(transferIn, ctx)).toBe(false);
  });

  it('vlastiti prijenos iz vlastitog novčanika u dijeljeni ostaje vidljiv', () => {
    const outgoing = row({ payment_source: `custom:${MINE}`, type: 'transfer', income_source_id: SHARED });
    expect(isSharedRowVisible(outgoing, ctx)).toBe(true);
  });

  it('redci izvan dijeljenih novčanika prolaze nedirnuti', () => {
    expect(isSharedRowVisible(row({ user_id: OTHER, payment_source: 'cash' }), ctx)).toBe(true);
  });

  it('filtar uklanja samo tuđe redke s dijeljenog novčanika', () => {
    const mine = row();
    const theirs = row({ user_id: OTHER });
    expect(applySharedAccessFilter([mine, theirs], ctx)).toEqual([mine]);
  });
});
