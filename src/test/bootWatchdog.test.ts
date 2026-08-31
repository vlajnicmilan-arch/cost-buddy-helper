import { describe, it, expect } from 'vitest';
import {
  ERROR_PROXIMITY_MS,
  INTENTIONAL_RELOAD_FLAG,
  INTENTIONAL_RELOAD_TTL_MS,
  consumeIntentionalReload,
  evaluatePreviousBoot,
  markIntentionalReload,
  readLastErrorAt,
  markErrorSignal,
  LAST_ERROR_FLAG,
} from '@/lib/bootWatchdog';

const makeStorage = (data: Record<string, string> = {}) => ({
  data,
  getItem: (k: string) => data[k] ?? null,
  setItem: (k: string, v: string) => { data[k] = v; },
  removeItem: (k: string) => { delete data[k]; },
});

const NOW = 1_700_000_000_000;

describe('intentional reload stamp', () => {
  it('is consumed exactly once', () => {
    const s = makeStorage();
    markIntentionalReload({ reason: 'bundle_freshness', from: 'a', to: 'b', now: NOW }, s);
    expect(s.data[INTENTIONAL_RELOAD_FLAG]).toBeTruthy();

    const first = consumeIntentionalReload(s, NOW + 500);
    expect(first?.reason).toBe('bundle_freshness');
    expect(consumeIntentionalReload(s, NOW + 600)).toBeNull();
  });

  it('is ignored when stale, so it cannot mask a later crash', () => {
    const s = makeStorage();
    markIntentionalReload({ reason: 'bundle_freshness', now: NOW }, s);
    expect(consumeIntentionalReload(s, NOW + INTENTIONAL_RELOAD_TTL_MS + 1)).toBeNull();
  });
});

describe('evaluatePreviousBoot', () => {
  const base = { startedAt: '2026-08-31T07:14:29.000Z', now: NOW };

  it('reports nothing when the flag was cleared (orderly exit)', () => {
    expect(
      evaluatePreviousBoot({ ...base, flag: null, intentionalReload: null, lastErrorAt: null }).kind,
    ).toBe('none');
  });

  it('does not report a crash for a reload we triggered ourselves', () => {
    const verdict = evaluatePreviousBoot({
      ...base,
      flag: '1',
      intentionalReload: { at: NOW - 1000, reason: 'bundle_freshness', from: 'a', to: 'b' },
      lastErrorAt: null,
    });
    expect(verdict.kind).toBe('intentional_reload');
    expect(verdict.event).toBe('bundle_refresh_boot');
    expect(verdict.severity).toBe('info');
  });

  it('never marks a stuck flag critical without a nearby error', () => {
    const verdict = evaluatePreviousBoot({
      ...base,
      flag: '1',
      intentionalReload: null,
      lastErrorAt: null,
    });
    expect(verdict.event).toBe('previous_boot_crashed');
    expect(verdict.severity).toBe('warning');
    expect(verdict.details?.reason).toBe('unknown_no_error_signal');
  });

  it('treats a long-stale error as no error at all', () => {
    const verdict = evaluatePreviousBoot({
      ...base,
      flag: '1',
      intentionalReload: null,
      lastErrorAt: NOW - ERROR_PROXIMITY_MS - 1,
    });
    expect(verdict.severity).toBe('warning');
  });

  it('is critical when a stuck flag comes with a real error signal', () => {
    const verdict = evaluatePreviousBoot({
      ...base,
      flag: '1',
      intentionalReload: null,
      lastErrorAt: NOW - 2000,
    });
    expect(verdict.kind).toBe('crash');
    expect(verdict.event).toBe('previous_boot_crashed');
    expect(verdict.severity).toBe('critical');
    expect(verdict.details?.reason).toBe('error_before_mount');
  });

  it('stays informational in preview environments', () => {
    expect(
      evaluatePreviousBoot({
        ...base,
        flag: '1',
        intentionalReload: null,
        lastErrorAt: NOW - 2000,
        isPreviewEnv: true,
      }).severity,
    ).toBe('info');
  });
});

describe('error signal', () => {
  it('round-trips through storage', () => {
    const s = makeStorage();
    markErrorSignal(NOW, s);
    expect(s.data[LAST_ERROR_FLAG]).toBe(String(NOW));
    expect(readLastErrorAt(s)).toBe(NOW);
    expect(readLastErrorAt(makeStorage())).toBeNull();
  });
});
