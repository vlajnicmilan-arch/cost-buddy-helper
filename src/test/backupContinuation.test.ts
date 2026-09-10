import { describe, it, expect } from 'vitest';
import {
  MAX_CONTINUATIONS,
  parseContinuation,
  isRunComplete,
  shouldContinue,
  decideMail,
  incompleteReason,
} from '../../supabase/functions/_shared/backupContinuation';

describe('parseContinuation', () => {
  it('nedostaje tijelo ili polje = 0', () => {
    expect(parseContinuation(undefined)).toBe(0);
    expect(parseContinuation(null)).toBe(0);
    expect(parseContinuation({})).toBe(0);
    expect(parseContinuation({ continuation: 'x' })).toBe(0);
  });

  it('čita broj i ograničava ga na maksimum', () => {
    expect(parseContinuation({ continuation: 2 })).toBe(2);
    expect(parseContinuation({ continuation: '3' })).toBe(3);
    expect(parseContinuation({ continuation: 99 })).toBe(MAX_CONTINUATIONS);
  });
});

describe('shouldContinue', () => {
  it('ne pokreće nastavak kad je potpuno', () => {
    const state = { filesZipIncomplete: false, filesRemaining: 0, continuation: 0 };
    expect(isRunComplete(state)).toBe(true);
    expect(shouldContinue(state)).toBe(false);
  });

  it('pokreće nastavak kad zip nije dovršen', () => {
    expect(shouldContinue({ filesZipIncomplete: true, filesRemaining: 0, continuation: 0 })).toBe(true);
  });

  it('pokreće nastavak kad su preostali prilozi', () => {
    expect(shouldContinue({ filesZipIncomplete: false, filesRemaining: 5, continuation: 3 })).toBe(true);
  });

  it('ne pokreće nastavak na continuation >= 6', () => {
    expect(shouldContinue({ filesZipIncomplete: true, filesRemaining: 2, continuation: MAX_CONTINUATIONS })).toBe(false);
    expect(shouldContinue({ filesZipIncomplete: true, filesRemaining: 2, continuation: 7 })).toBe(false);
  });
});

describe('decideMail', () => {
  it('mail samo kad je potpuno', () => {
    expect(decideMail({ filesZipIncomplete: false, filesRemaining: 0, continuation: 1 })).toEqual({
      send: true,
      incomplete: false,
    });
  });

  it('nepotpuno pokretanje ne šalje mail', () => {
    expect(decideMail({ filesZipIncomplete: true, filesRemaining: 3, continuation: 0 })).toEqual({ send: false });
    expect(decideMail({ filesZipIncomplete: false, filesRemaining: 3, continuation: 5 })).toEqual({ send: false });
  });

  it('nakon iscrpljenih nastavaka šalje NEPOTPUNA mail', () => {
    expect(decideMail({ filesZipIncomplete: true, filesRemaining: 1, continuation: MAX_CONTINUATIONS })).toEqual({
      send: true,
      incomplete: true,
    });
  });
});

describe('incompleteReason', () => {
  it('navodi koliko dijelova i datoteka nedostaje', () => {
    const reason = incompleteReason({ partsDone: 2, partsPlanned: 5, filesRemaining: 7 });
    expect(reason).toContain('3 od 5');
    expect(reason).toContain('7');
  });
});
