import { describe, it, expect } from 'vitest';
import {
  BRIEF_GATE_MIN_GAP_MS,
  hasAnyTruth,
  isFrequencyAllowed,
  isGateCandidate,
  truthsFromSnapshot,
  greetingSlot,
  localDayKey,
} from '../briefGate';

const now = new Date('2026-08-15T12:00:00');

describe('briefGate — tišina', () => {
  it('nema istina => bez vrata', () => {
    const truths = truthsFromSnapshot({ enabled: true }, false);
    expect(hasAnyTruth(truths)).toBe(false);
  });

  it('bilo koja istina => vrata', () => {
    expect(hasAnyTruth(truthsFromSnapshot({ enabled: true, invoices: { count: 1, nextDue: null } }, false))).toBe(true);
    expect(hasAnyTruth(truthsFromSnapshot({ enabled: true, documents: { count: 2 } }, false))).toBe(true);
    expect(hasAnyTruth(truthsFromSnapshot({ enabled: true, attention: { count: 3 } }, false))).toBe(true);
    expect(hasAnyTruth(truthsFromSnapshot({ enabled: true }, true))).toBe(true);
  });
});

describe('briefGate — učestalost', () => {
  it('prvi put (nema žiga) => dopušteno', () => {
    expect(isFrequencyAllowed(null, now)).toBe(true);
  });

  it('isti dan, < 4 h => bez vrata', () => {
    const last = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(isFrequencyAllowed(last, now)).toBe(false);
  });

  it('isti dan, >= 4 h => vrata', () => {
    const last = new Date(now.getTime() - BRIEF_GATE_MIN_GAP_MS).toISOString();
    expect(isFrequencyAllowed(last, now)).toBe(true);
  });

  it('novi lokalni dan => vrata i kad je prošlo manje od 4 h', () => {
    const early = new Date('2026-08-15T01:00:00');
    const last = new Date('2026-08-14T23:00:00').toISOString();
    expect(isFrequencyAllowed(last, early)).toBe(true);
  });

  it('neispravan žig => fail-open (dopušteno)', () => {
    expect(isFrequencyAllowed('nije-datum', now)).toBe(true);
  });

  it('localDayKey koristi lokalni dan', () => {
    expect(localDayKey(new Date('2026-08-15T12:00:00'))).toBe('2026-08-15');
  });
});

describe('briefGate — kandidat (flagovi)', () => {
  const base = { userDisabled: false, lastShownIso: null, now };

  it('flag off => nikad', () => {
    expect(isGateCandidate({ ...base, buildEnabled: false })).toBe(false);
  });

  it('korisnik ugasio => nikad', () => {
    expect(isGateCandidate({ ...base, buildEnabled: true, userDisabled: true })).toBe(false);
  });

  it('flag on + dopuštena učestalost => kandidat', () => {
    expect(isGateCandidate({ ...base, buildEnabled: true })).toBe(true);
  });

  it('20 ulazaka u sat => samo prvi je kandidat', () => {
    let last: string | null = null;
    let shown = 0;
    for (let i = 0; i < 20; i++) {
      const t = new Date(now.getTime() + i * 3 * 60 * 1000);
      if (isGateCandidate({ buildEnabled: true, userDisabled: false, lastShownIso: last, now: t })) {
        shown += 1;
        last = t.toISOString();
      }
    }
    expect(shown).toBe(1);
  });
});

describe('briefGate — pozdrav', () => {
  it('doba dana', () => {
    expect(greetingSlot(new Date('2026-08-15T07:00:00'))).toBe('morning');
    expect(greetingSlot(new Date('2026-08-15T13:00:00'))).toBe('day');
    expect(greetingSlot(new Date('2026-08-15T20:00:00'))).toBe('evening');
  });
});
