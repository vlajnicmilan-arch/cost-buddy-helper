import { describe, it, expect } from 'vitest';
import {
  GUIDED_EXPENSE_THRESHOLD,
  getGuidedHomeStatus,
  shouldAutoExitGuided,
} from '@/lib/guidedMode';

describe('guidedMode', () => {
  it('threshold je 3', () => {
    expect(GUIDED_EXPENSE_THRESHOLD).toBe(3);
  });

  it('server timestamp uvijek prevladava — standard', () => {
    expect(
      getGuidedHomeStatus({ guidedHomeExitedAt: '2026-06-18T00:00:00Z', expenseCount: 0 }),
    ).toBe('standard');
  });

  it('null timestamp + 0 unosa → zero_data', () => {
    expect(getGuidedHomeStatus({ guidedHomeExitedAt: null, expenseCount: 0 })).toBe('zero_data');
  });

  it('null timestamp + 1..2 unosa → guided', () => {
    expect(getGuidedHomeStatus({ guidedHomeExitedAt: null, expenseCount: 1 })).toBe('guided');
    expect(getGuidedHomeStatus({ guidedHomeExitedAt: null, expenseCount: 2 })).toBe('guided');
  });

  it('null timestamp + threshold+ unosa → standard (auto-exit pending)', () => {
    expect(getGuidedHomeStatus({ guidedHomeExitedAt: null, expenseCount: 3 })).toBe('standard');
    expect(getGuidedHomeStatus({ guidedHomeExitedAt: null, expenseCount: 99 })).toBe('standard');
  });

  it('shouldAutoExitGuided true samo kad nema timestampa a unosa je dovoljno', () => {
    expect(shouldAutoExitGuided({ guidedHomeExitedAt: null, expenseCount: 3 })).toBe(true);
    expect(shouldAutoExitGuided({ guidedHomeExitedAt: null, expenseCount: 2 })).toBe(false);
    expect(shouldAutoExitGuided({ guidedHomeExitedAt: '2026-06-18T00:00:00Z', expenseCount: 99 })).toBe(false);
  });

  it('idempotentnost: korisnik koji već ima timestamp ne treba ponovno marker', () => {
    expect(
      shouldAutoExitGuided({ guidedHomeExitedAt: '2026-01-01T00:00:00Z', expenseCount: 0 }),
    ).toBe(false);
  });
});
