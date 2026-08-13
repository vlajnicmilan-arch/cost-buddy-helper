import { describe, expect, it } from 'vitest';
import { buildKrugFields } from '../krugExpenseFields';

describe('buildKrugFields', () => {
  it('poslovni profil gasi Krug polja', () => {
    expect(buildKrugFields('bp1', 'k1', 'shared')).toEqual({ krug_id: null, krug_privacy: null });
  });

  it('osobni kontekst prenosi krug i privacy', () => {
    expect(buildKrugFields(null, 'k1', 'shared')).toEqual({ krug_id: 'k1', krug_privacy: 'shared' });
  });

  it('bez kruga nema privacy', () => {
    expect(buildKrugFields(null, null, 'shared')).toEqual({ krug_id: null, krug_privacy: null });
  });

  it('sken usmjeren u poslovni profil ne nosi Krug polja', () => {
    // targetBusinessProfileId dolazi iz routinga, ne iz aktivnog konteksta
    expect(buildKrugFields('bp-from-oib', 'k1', 'personal')).toEqual({ krug_id: null, krug_privacy: null });
  });
});
