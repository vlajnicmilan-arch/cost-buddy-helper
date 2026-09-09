import { describe, it, expect } from 'vitest';
import {
  isAdminSubscriptionActive,
  resolveEntitlements,
  modulesForTier,
  type EntitlementMap,
} from '../../supabase/functions/check-subscription/resolve';

const off = { active: false, source: null, period_end: null };
const empty = (): EntitlementMap => ({
  smjer: { ...off }, krug: { ...off }, projekti: { ...off }, biznis: { ...off },
});

describe('admin tier više ne projicira entitlemente (9.9.2026)', () => {
  it('korisnik s tierom pro bez entitlementa nema smjer', () => {
    const sub = { tier: 'pro', expires_at: null };
    expect(isAdminSubscriptionActive(sub)).toBe(true);
    const out = resolveEntitlements(empty());
    expect(out.smjer.active).toBe(false);
    expect(out.krug.active).toBe(false);
    expect(out.projekti.active).toBe(false);
    expect(out.biznis.active).toBe(false);
  });

  it('admin business tier ne otključava biznis bez entitlementa', () => {
    const out = resolveEntitlements(empty());
    expect(out.biznis.active).toBe(false);
  });

  it('stvarni entitlementi prolaze nepromijenjeni', () => {
    const granted: EntitlementMap = {
      smjer: { active: true, source: 'admin_grant', period_end: null },
      krug: { ...off },
      projekti: { active: true, source: 'paddle', period_end: null },
      biznis: { ...off },
    };
    expect(resolveEntitlements(granted)).toEqual(granted);
  });

  it('tier mapiranje ostaje kao referenca', () => {
    expect(modulesForTier('business')).toEqual(['smjer', 'krug', 'projekti', 'biznis']);
    expect(modulesForTier('free')).toEqual([]);
  });

  it('istekla admin pretplata nije aktivna', () => {
    expect(isAdminSubscriptionActive({ tier: 'business', expires_at: '2020-01-01T00:00:00Z' })).toBe(false);
    expect(isAdminSubscriptionActive(null)).toBe(false);
  });
});
