import { describe, it, expect } from 'vitest';
import {
  isAdminSubscriptionActive,
  projectAdminSubscription,
  modulesForTier,
  type EntitlementMap,
} from '../../supabase/functions/check-subscription/resolve';

const off = { active: false, source: null, period_end: null };
const empty = (): EntitlementMap => ({
  smjer: { ...off }, krug: { ...off }, projekti: { ...off }, biznis: { ...off },
});

// Živa kombinacija korisnika 3213303b: admin business bez isteka,
// business_legacy otključava smjer/krug/projekti, biznis NE,
// plus zaostali trial redovi istekli 2026-03-03 sa status='active'.
const liveCase = (): EntitlementMap => ({
  smjer: { active: true, source: 'migration', period_end: null },
  krug: { active: true, source: 'migration', period_end: null },
  projekti: { active: true, source: 'migration', period_end: null },
  biznis: { ...off },
});

describe('admin subscription projection', () => {
  it('admin business bez isteka je aktivan', () => {
    expect(isAdminSubscriptionActive({ tier: 'business', expires_at: null })).toBe(true);
  });

  it('free ili istekla pretplata nije aktivna', () => {
    expect(isAdminSubscriptionActive({ tier: 'free', expires_at: null })).toBe(false);
    expect(isAdminSubscriptionActive({ tier: 'business', expires_at: '2020-01-01T00:00:00Z' })).toBe(false);
    expect(isAdminSubscriptionActive(null)).toBe(false);
  });

  it('tier mapiranje', () => {
    expect(modulesForTier('business')).toEqual(['smjer', 'krug', 'projekti', 'biznis']);
    expect(modulesForTier('pro')).toEqual(['smjer', 'krug', 'projekti']);
    expect(modulesForTier('free')).toEqual([]);
  });

  it('živa kombinacija: biznis se otključa unatoč zaostalim trial redovima', () => {
    const out = projectAdminSubscription(liveCase(), { tier: 'business', expires_at: null });
    expect(out.biznis.active).toBe(true);
    expect(out.biznis.source).toBe('admin');
    // postojeći aktivni izvori ostaju netaknuti
    expect(out.smjer.source).toBe('migration');
  });

  it('regresija: korisnik bez pretplate ostaje read-only', () => {
    const out = projectAdminSubscription(empty(), { tier: 'free', expires_at: null });
    expect(Object.values(out).every((m) => !m.active)).toBe(true);
  });

  it('regresija: admin korisnik s vlastitim admin_grant redovima ostaje netaknut', () => {
    const granted: EntitlementMap = {
      smjer: { active: true, source: 'admin_grant', period_end: null },
      krug: { active: true, source: 'admin_grant', period_end: null },
      projekti: { active: true, source: 'admin_grant', period_end: null },
      biznis: { active: true, source: 'admin_grant', period_end: null },
    };
    const out = projectAdminSubscription(granted, { tier: 'business', expires_at: null });
    expect(out).toEqual(granted);
  });

  it('pro admin pretplata ne otključava biznis', () => {
    const out = projectAdminSubscription(empty(), { tier: 'pro', expires_at: null });
    expect(out.smjer.active).toBe(true);
    expect(out.biznis.active).toBe(false);
  });
});
