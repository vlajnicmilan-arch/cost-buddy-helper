import { describe, it, expect } from 'vitest';
import { KRUG_PRESETS, canAddPunopravni, getKrugPresetSpec } from '../krugPresets';

describe('krugPresets', () => {
  it('izlaže točno tri preseta u v1 UI skoupu', () => {
    expect(KRUG_PRESETS.map((p) => p.key)).toEqual(['partner', 'su_roditelj', 'cimer']);
  });

  it('cap je 2 za partner i su_roditelj, 6 za cimer', () => {
    expect(getKrugPresetSpec('partner')!.maxPunopravni).toBe(2);
    expect(getKrugPresetSpec('su_roditelj')!.maxPunopravni).toBe(2);
    expect(getKrugPresetSpec('cimer')!.maxPunopravni).toBe(6);
  });

  it('canAddPunopravni dopušta dok ne premaši cap (inkluzivno s ownerom)', () => {
    expect(canAddPunopravni('partner', 0)).toBe(true);
    expect(canAddPunopravni('partner', 1)).toBe(true);
    expect(canAddPunopravni('partner', 2)).toBe(false);
    expect(canAddPunopravni('cimer', 5)).toBe(true);
    expect(canAddPunopravni('cimer', 6)).toBe(false);
  });

  it('neuključeni preset (npr. putovanje) ne diktira cap iz UI sloja', () => {
    expect(canAddPunopravni('putovanje', 99)).toBe(true);
    expect(getKrugPresetSpec('putovanje')).toBeNull();
  });

  it('null/undefined preset = bez cap-a', () => {
    expect(canAddPunopravni(null, 0)).toBe(true);
    expect(canAddPunopravni(undefined, 0)).toBe(true);
    expect(getKrugPresetSpec(null)).toBeNull();
  });
});
