import { describe, it, expect } from 'vitest';
import { deriveGrantStatus } from '../useAdminModuleGrants';

const NOW = new Date('2026-06-04T12:00:00Z');

describe('deriveGrantStatus', () => {
  it('returns revoked when revoked_at is set (even if not yet expired)', () => {
    expect(
      deriveGrantStatus(
        { revoked_at: '2026-06-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z' },
        NOW
      )
    ).toBe('revoked');
  });

  it('returns revoked when revoked_at is set AND expires_at is past (revoked has priority)', () => {
    expect(
      deriveGrantStatus(
        { revoked_at: '2026-05-01T00:00:00Z', expires_at: '2026-05-10T00:00:00Z' },
        NOW
      )
    ).toBe('revoked');
  });

  it('returns expired when not revoked and expires_at <= now', () => {
    expect(
      deriveGrantStatus({ revoked_at: null, expires_at: '2026-05-01T00:00:00Z' }, NOW)
    ).toBe('expired');
  });

  it('returns expired when expires_at exactly equals now', () => {
    expect(
      deriveGrantStatus({ revoked_at: null, expires_at: NOW.toISOString() }, NOW)
    ).toBe('expired');
  });

  it('returns active when not revoked, expires_at is in future', () => {
    expect(
      deriveGrantStatus({ revoked_at: null, expires_at: '2027-01-01T00:00:00Z' }, NOW)
    ).toBe('active');
  });

  it('returns active when not revoked and expires_at is null (permanent)', () => {
    expect(deriveGrantStatus({ revoked_at: null, expires_at: null }, NOW)).toBe('active');
  });
});
