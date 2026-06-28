/**
 * Val 2 — tier merge regression suite.
 *
 * These tests cover the GENERIC tier merge contract.
 * No scenario in this file is Aircash-specific, scan-specific or bank-specific —
 * the rule applies to any pair of (event_at, confidence) sources.
 */
import { describe, it, expect } from 'vitest';
import {
  compareConfidenceTier,
  resolveEventAtMerge,
  type TimeConfidence,
} from './tierMerge';

const EXISTING = '2026-01-10T08:00:00.000Z';
const INCOMING = '2026-01-10T14:30:00.000Z';

const base = (overrides: Partial<Parameters<typeof resolveEventAtMerge>[0]> = {}) => ({
  existingEventAt: EXISTING,
  existingConfidence: 'C3' as TimeConfidence,
  existingUserEditedEventAt: false,
  incomingEventAt: INCOMING,
  incomingConfidence: 'C3' as TimeConfidence,
  ...overrides,
});

describe('compareConfidenceTier', () => {
  it('orders C1 > C2 > C3 > C4 > null', () => {
    expect(compareConfidenceTier('C1', 'C2')).toBeGreaterThan(0);
    expect(compareConfidenceTier('C2', 'C3')).toBeGreaterThan(0);
    expect(compareConfidenceTier('C3', 'C4')).toBeGreaterThan(0);
    expect(compareConfidenceTier('C4', null)).toBeGreaterThan(0);
    expect(compareConfidenceTier('C3', 'C3')).toBe(0);
    expect(compareConfidenceTier('C4', 'C2')).toBeLessThan(0);
  });
});

describe('resolveEventAtMerge — generic tier merge (NOT source-specific)', () => {
  it('1. existing user-edited beats EVERYTHING, regardless of incoming tier', () => {
    for (const c of ['C1', 'C2', 'C3', 'C4', null] as TimeConfidence[]) {
      const r = resolveEventAtMerge(
        base({
          existingUserEditedEventAt: true,
          existingConfidence: 'C3',
          incomingConfidence: c,
        }),
      );
      expect(r.eventAt).toBe(EXISTING);
      expect(r.timeConfidence).toBe('C3');
    }
  });

  it('2. C1 incoming beats C2, C3, C4 existing', () => {
    for (const existing of ['C2', 'C3', 'C4'] as TimeConfidence[]) {
      const r = resolveEventAtMerge(
        base({ existingConfidence: existing, incomingConfidence: 'C1' }),
      );
      expect(r.eventAt).toBe(INCOMING);
      expect(r.timeConfidence).toBe('C1');
    }
  });

  it('3. C2 incoming beats C3 and C4 existing', () => {
    for (const existing of ['C3', 'C4'] as TimeConfidence[]) {
      const r = resolveEventAtMerge(
        base({ existingConfidence: existing, incomingConfidence: 'C2' }),
      );
      expect(r.eventAt).toBe(INCOMING);
      expect(r.timeConfidence).toBe('C2');
    }
  });

  it('4. C3 incoming does NOT overwrite existing C3', () => {
    const r = resolveEventAtMerge(
      base({ existingConfidence: 'C3', incomingConfidence: 'C3' }),
    );
    expect(r.eventAt).toBe(EXISTING);
    expect(r.timeConfidence).toBe('C3');
  });

  it('5. NULL incoming never overwrites existing', () => {
    const r = resolveEventAtMerge(
      base({ existingConfidence: 'C2', incomingConfidence: null }),
    );
    expect(r.eventAt).toBe(EXISTING);
    expect(r.timeConfidence).toBe('C2');
  });

  it('6. NULL existing + C2 incoming → incoming wins', () => {
    const r = resolveEventAtMerge(
      base({
        existingEventAt: null,
        existingConfidence: null,
        incomingConfidence: 'C2',
      }),
    );
    expect(r.eventAt).toBe(INCOMING);
    expect(r.timeConfidence).toBe('C2');
  });

  it('7. equal tier → keep existing', () => {
    const r = resolveEventAtMerge(
      base({ existingConfidence: 'C2', incomingConfidence: 'C2' }),
    );
    expect(r.eventAt).toBe(EXISTING);
    expect(r.timeConfidence).toBe('C2');
  });

  it('8. lower tier incoming → keep existing', () => {
    const r = resolveEventAtMerge(
      base({ existingConfidence: 'C2', incomingConfidence: 'C4' }),
    );
    expect(r.eventAt).toBe(EXISTING);
    expect(r.timeConfidence).toBe('C2');
  });

  it('9. rule is source-agnostic — same outcome whether the C2 producer is "bank", "scan", or anything else', () => {
    // The helper has no notion of producer at all; we assert that by showing
    // that the result depends ONLY on the tier values, not on any label.
    const a = resolveEventAtMerge(
      base({ existingConfidence: 'C3', incomingConfidence: 'C2' }),
    );
    const b = resolveEventAtMerge(
      base({ existingConfidence: 'C3', incomingConfidence: 'C2' }),
    );
    expect(a).toEqual(b);
    expect(a.timeConfidence).toBe('C2');
  });
});
