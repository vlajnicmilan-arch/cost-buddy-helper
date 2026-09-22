import { describe, it, expect } from 'vitest';
import { planFingerprintRekey } from '@/lib/importReview/fingerprintRekey';

describe('planFingerprintRekey — prijelaz na ključ v2', () => {
  it('redak koji već postoji pod novim ključem se ne dira', () => {
    const plan = planFingerprintRekey({
      keysV2: ['imp2:a'],
      legacyKeys: ['imp:a'],
      live: new Set(['imp2:a']),
      deleted: new Set(),
    });
    expect(plan.pairs).toEqual([]);
    expect(plan.fingerprints).toEqual(['imp2:a']);
    expect(plan.live.has('imp2:a')).toBe(true);
  });

  it('redak nađen po STAROM ključu se rekeya, ne duplicira', () => {
    const plan = planFingerprintRekey({
      keysV2: ['imp2:a'],
      legacyKeys: ['imp:a'],
      live: new Set(['imp:a']),
      deleted: new Set(),
    });
    expect(plan.pairs).toEqual([{ old: 'imp:a', new: 'imp2:a' }]);
    expect(plan.fingerprints).toEqual(['imp2:a']);
    // novi ključ nasljeđuje stanje "živ" → uvoz ga vidi kao postojeći
    expect(plan.live.has('imp2:a')).toBe(true);
    expect(plan.live.has('imp:a')).toBe(false);
  });

  it('soft-obrisan redak sa starim ključem ostaje prepoznat kao obrisan', () => {
    const plan = planFingerprintRekey({
      keysV2: ['imp2:a'],
      legacyKeys: ['imp:a'],
      live: new Set(),
      deleted: new Set(['imp:a']),
    });
    expect(plan.pairs).toEqual([{ old: 'imp:a', new: 'imp2:a' }]);
    expect(plan.deleted.has('imp2:a')).toBe(true);
    expect(plan.live.has('imp2:a')).toBe(false);
  });

  it('nepoznat redak dobiva v2 ključ bez rekeya', () => {
    const plan = planFingerprintRekey({
      keysV2: ['imp2:new'],
      legacyKeys: ['imp:new'],
      live: new Set(),
      deleted: new Set(),
    });
    expect(plan.pairs).toEqual([]);
    expect(plan.fingerprints).toEqual(['imp2:new']);
  });

  it('bez dokazivog v2 ključa redak ostaje na starom otisku', () => {
    const plan = planFingerprintRekey({
      keysV2: [null],
      legacyKeys: ['imp:x'],
      live: new Set(['imp:x']),
      deleted: new Set(),
    });
    expect(plan.pairs).toEqual([]);
    expect(plan.fingerprints).toEqual(['imp:x']);
  });
});
