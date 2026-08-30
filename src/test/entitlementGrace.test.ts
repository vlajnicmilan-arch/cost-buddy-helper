import { describe, expect, it } from 'vitest';
import { graceEndsAt, isInGrace, GRACE_DAYS } from '@/lib/entitlementGrace';

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

describe('poček kod neuspjele naplate', () => {
  it('past_due unutar 7 dana zadržava pravo', () => {
    expect(isInGrace('past_due', { past_due_since: iso(3) })).toBe(true);
  });

  it('past_due nakon 7 dana gubi pravo', () => {
    expect(isInGrace('past_due', { past_due_since: iso(GRACE_DAYS + 1) })).toBe(false);
  });

  it('otkaz i opoziv nemaju poček', () => {
    expect(isInGrace('canceled', { past_due_since: iso(1) })).toBe(false);
    expect(isInGrace('revoked', { past_due_since: iso(1) })).toBe(false);
    expect(graceEndsAt('canceled', { past_due_since: iso(1) })).toBeNull();
  });

  it('bez sidra nema počeka', () => {
    expect(isInGrace('past_due', {})).toBe(false);
    expect(isInGrace('past_due', null)).toBe(false);
  });
});
