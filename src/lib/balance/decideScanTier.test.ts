import { describe, it, expect } from 'vitest';
import { decideScanTier, type DecideScanTierInput } from './decideScanTier';

// Reference "now" used across tests — frozen point so range checks are stable.
const NOW = new Date('2025-01-20T16:00:00+01:00');

function base(overrides: Partial<DecideScanTierInput> = {}): DecideScanTierInput {
  return {
    issued_at_iso: '2025-01-20T15:30:00+01:00',
    issued_at_raw: '20.01.2025 15:30:42',
    issued_at_label_present: true,
    fiscal_marker_present: true,
    userEditedDateOrTime: false,
    now: NOW,
    ...overrides,
  };
}

describe('decideScanTier', () => {
  it('T1 — clean fiscal receipt with valid time → C1', () => {
    const d = decideScanTier(base());
    expect(d.tier).toBe('C1');
    expect(d.eventAt).toBe('2025-01-20T15:30:00+01:00');
    expect(d.reason).toBe('c1_ok');
  });

  it('T2 — no time (iso null) → C3 / iso_invalid', () => {
    const d = decideScanTier(base({ issued_at_iso: null }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('iso_invalid');
    expect(d.eventAt).toBeNull();
  });

  it('T3 — label not present → C3 / no_time_label', () => {
    const d = decideScanTier(base({ issued_at_label_present: false }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('no_time_label');
  });

  it('T4 — no fiscal marker → C3 / no_fiscal_marker', () => {
    const d = decideScanTier(base({ fiscal_marker_present: false }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('no_fiscal_marker');
  });

  it('T5 — raw and iso time differ (hallucination guard) → C3 / raw_iso_mismatch', () => {
    const d = decideScanTier(base({ issued_at_raw: '20.01.2025 09:12' }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('raw_iso_mismatch');
  });

  it('T6 — iso > 1h in the future → C3 / out_of_range', () => {
    const future = new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString();
    const hh = future.slice(11, 13);
    const mm = future.slice(14, 16);
    const d = decideScanTier(base({
      issued_at_iso: future.replace('Z', '+00:00'),
      issued_at_raw: `${hh}:${mm}`,
    }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('out_of_range');
  });

  it('T7 — iso > 7 days in the past → C3 / out_of_range', () => {
    const past = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const hh = past.slice(11, 13);
    const mm = past.slice(14, 16);
    const d = decideScanTier(base({
      issued_at_iso: past.replace('Z', '+00:00'),
      issued_at_raw: `${hh}:${mm}`,
    }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('out_of_range');
  });

  it('T8 — user edited date/time → C3 / user_edited (even with perfect signals)', () => {
    const d = decideScanTier(base({ userEditedDateOrTime: true }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('user_edited');
  });

  it('T9 — date-only iso (no time component) → C3 / iso_invalid', () => {
    const d = decideScanTier(base({ issued_at_iso: '2025-01-20' }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('iso_invalid');
  });

  it('T10 — iso within +1h TZ tolerance → C1', () => {
    // 30 minutes in the future relative to NOW
    const slight = new Date(NOW.getTime() + 30 * 60 * 1000).toISOString().replace('Z', '+00:00');
    const hh = slight.slice(11, 13);
    const mm = slight.slice(14, 16);
    const d = decideScanTier(base({
      issued_at_iso: slight,
      issued_at_raw: `Datum/vrijeme ${hh}:${mm}`,
    }));
    expect(d.tier).toBe('C1');
  });

  it('raw with dot separator is accepted (e.g. "15.30")', () => {
    const d = decideScanTier(base({ issued_at_raw: '20.01.2025. 15.30' }));
    expect(d.tier).toBe('C1');
  });

  it('empty raw → C3 / raw_iso_mismatch', () => {
    const d = decideScanTier(base({ issued_at_raw: '' }));
    expect(d.tier).toBe('C3');
    expect(d.reason).toBe('raw_iso_mismatch');
  });
});
