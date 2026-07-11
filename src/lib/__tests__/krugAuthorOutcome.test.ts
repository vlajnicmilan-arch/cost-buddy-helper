/**
 * Krug — Author Outcome Detection guard.
 *
 * Wave: Krug Approval Outcome Visibility (residual fix).
 * Cilj: detektor NIKAD ne smije lažno okinuti signal osim na stvarnu
 * tranziciju vlastitog shared prijedloga iz `predlozena` u
 * `potvrdjena`/`nepotvrdjena`.
 */
import { describe, it, expect } from 'vitest';
import { detectAuthorOutcome } from '@/lib/krugAuthorOutcome';

const ME = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
const KRUG = '00000000-0000-0000-0000-0000000000cc';

const base = {
  user_id: ME,
  krug_id: KRUG,
  krug_privacy: 'shared',
  krug_shared_status: 'predlozena',
  deleted_at: null,
};

describe('detectAuthorOutcome', () => {
  it('confirms transition predlozena → potvrdjena for the author', () => {
    expect(
      detectAuthorOutcome(base, { ...base, krug_shared_status: 'potvrdjena' }, ME),
    ).toBe('confirmed');
  });

  it('rejects transition predlozena → nepotvrdjena for the author', () => {
    expect(
      detectAuthorOutcome(base, { ...base, krug_shared_status: 'nepotvrdjena' }, ME),
    ).toBe('rejected');
  });

  it('does nothing when caller is not the author', () => {
    expect(
      detectAuthorOutcome(base, { ...base, krug_shared_status: 'potvrdjena' }, OTHER),
    ).toBeNull();
  });

  it('does nothing without prev snapshot (INSERT / missing old row)', () => {
    expect(
      detectAuthorOutcome(null, { ...base, krug_shared_status: 'potvrdjena' }, ME),
    ).toBeNull();
  });

  it('does nothing when prev status was not predlozena (idempotent replays)', () => {
    expect(
      detectAuthorOutcome(
        { ...base, krug_shared_status: 'potvrdjena' },
        { ...base, krug_shared_status: 'potvrdjena' },
        ME,
      ),
    ).toBeNull();
  });

  it('does nothing outside shared flow (personal / legacy private)', () => {
    expect(
      detectAuthorOutcome(
        { ...base, krug_privacy: 'personal' },
        { ...base, krug_privacy: 'personal', krug_shared_status: 'potvrdjena' },
        ME,
      ),
    ).toBeNull();
  });

  it('does nothing on soft-deleted row', () => {
    expect(
      detectAuthorOutcome(
        base,
        { ...base, krug_shared_status: 'potvrdjena', deleted_at: new Date().toISOString() },
        ME,
      ),
    ).toBeNull();
  });

  it('does nothing without krug_id', () => {
    expect(
      detectAuthorOutcome(
        { ...base, krug_id: null },
        { ...base, krug_id: null, krug_shared_status: 'potvrdjena' },
        ME,
      ),
    ).toBeNull();
  });

  it('does nothing without a signed-in user', () => {
    expect(
      detectAuthorOutcome(base, { ...base, krug_shared_status: 'potvrdjena' }, null),
    ).toBeNull();
  });
});
