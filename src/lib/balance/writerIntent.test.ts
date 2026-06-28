/**
 * Val 2 — Writer intent regression suite.
 *
 * 6 scenarios from the replan document. The helper's job is to prevent
 * accidental precision leakage from default writers, and accidental loss
 * of precision from intentional writers.
 */
import { describe, it, expect } from 'vitest';
import { normalizeExpensePayload } from './writerIntent';

describe('normalizeExpensePayload', () => {
  it('1. default intent strips event_at, time_confidence, user_edited_event_at', () => {
    const out = normalizeExpensePayload(
      {
        amount: 10,
        description: 'x',
        event_at: '2026-01-01T12:00:00.000Z',
        time_confidence: 'C1',
        user_edited_event_at: true,
      },
      'default',
    );
    expect(out).toEqual({ amount: 10, description: 'x' });
    expect('event_at' in out).toBe(false);
    expect('time_confidence' in out).toBe(false);
    expect('user_edited_event_at' in out).toBe(false);
  });

  it('2. default intent leaves an already-clean payload untouched', () => {
    const out = normalizeExpensePayload({ amount: 5, description: 'y' }, 'default');
    expect(out).toEqual({ amount: 5, description: 'y' });
  });

  it('3. explicit_time_edit passes event_at through and forces user_edited_event_at=true', () => {
    const out = normalizeExpensePayload(
      {
        amount: 12,
        event_at: '2026-02-02T09:15:00.000Z',
        time_confidence: 'C2',
        user_edited_event_at: false,
      },
      'explicit_time_edit',
    );
    expect(out.event_at).toBe('2026-02-02T09:15:00.000Z');
    expect(out.user_edited_event_at).toBe(true);
    // time_confidence intentionally NOT carried by explicit_time_edit.
    expect('time_confidence' in out).toBe(false);
  });

  it('4. system_precise carries event_at + time_confidence, forces user_edited_event_at=false', () => {
    const out = normalizeExpensePayload(
      {
        amount: 7,
        event_at: '2026-03-03T17:42:00.000Z',
        time_confidence: 'C1',
        user_edited_event_at: true, // attacker / careless caller
      },
      'system_precise',
    );
    expect(out.event_at).toBe('2026-03-03T17:42:00.000Z');
    expect(out.time_confidence).toBe('C1');
    expect(out.user_edited_event_at).toBe(false);
  });

  it('5. system_precise with missing event_at degrades to null (does not invent time)', () => {
    const out = normalizeExpensePayload(
      { amount: 1, time_confidence: 'C1' as const },
      'system_precise',
    );
    expect(out.event_at ?? null).toBeNull();
    expect(out.time_confidence).toBe('C1');
    expect(out.user_edited_event_at).toBe(false);
  });

  it('6. helper returns a new object (no input mutation)', () => {
    const input = {
      amount: 9,
      event_at: '2026-04-04T00:00:00.000Z',
      time_confidence: 'C2' as const,
      user_edited_event_at: true,
    };
    const snapshot = { ...input };
    normalizeExpensePayload(input, 'default');
    expect(input).toEqual(snapshot);
  });
});
