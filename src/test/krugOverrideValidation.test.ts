import { describe, it, expect } from 'vitest';
import { validateOverrideShares } from '@/hooks/useKrugExpenseOverride';

describe('validateOverrideShares', () => {
  const full = ['u1', 'u2', 'u3'];

  it('accepts perfect split summing to 100', () => {
    const r = validateOverrideShares(
      [{ user_id: 'u1', share_percent: 50 }, { user_id: 'u2', share_percent: 30 }, { user_id: 'u3', share_percent: 20 }],
      full,
    );
    expect(r.ok).toBe(true);
  });

  it('accepts sum within 0.01 tolerance', () => {
    const r = validateOverrideShares(
      [{ user_id: 'u1', share_percent: 33.33 }, { user_id: 'u2', share_percent: 33.33 }, { user_id: 'u3', share_percent: 33.34 }],
      full,
    );
    expect(r.ok).toBe(true);
  });

  it('rejects missing members', () => {
    const r = validateOverrideShares(
      [{ user_id: 'u1', share_percent: 60 }, { user_id: 'u2', share_percent: 40 }],
      full,
    );
    expect(r).toEqual({ ok: false, error: 'missing_members' });
  });

  it('rejects extra members', () => {
    const r = validateOverrideShares(
      [
        { user_id: 'u1', share_percent: 25 }, { user_id: 'u2', share_percent: 25 },
        { user_id: 'u3', share_percent: 25 }, { user_id: 'u4', share_percent: 25 },
      ],
      full,
    );
    expect(r).toEqual({ ok: false, error: 'extra_members' });
  });

  it('rejects sum != 100', () => {
    const r = validateOverrideShares(
      [{ user_id: 'u1', share_percent: 40 }, { user_id: 'u2', share_percent: 40 }, { user_id: 'u3', share_percent: 10 }],
      full,
    );
    expect(r).toEqual({ ok: false, error: 'sum_not_100' });
  });

  it('rejects negative share', () => {
    const r = validateOverrideShares(
      [{ user_id: 'u1', share_percent: 110 }, { user_id: 'u2', share_percent: -5 }, { user_id: 'u3', share_percent: -5 }],
      full,
    );
    expect(r).toEqual({ ok: false, error: 'negative' });
  });

  it('handles solo full member (100% self)', () => {
    const r = validateOverrideShares([{ user_id: 'u1', share_percent: 100 }], ['u1']);
    expect(r.ok).toBe(true);
  });
});
