import { describe, it, expect } from 'vitest';
import {
  shouldForceRedirectAway,
  shouldExitOnCheckoutSuccess,
  needsKompletOverlapConfirm,
  overlappingPaddleModules,
  isPlanAlreadyActive,
  type EntitlementMap,
} from '@/lib/paywallGate';

const ent = (active: boolean, source: string | null = null) => ({ active, source });
const empty: EntitlementMap = {
  smjer: ent(false), krug: ent(false), projekti: ent(false), biznis: ent(false),
};

describe('paywallGate.shouldForceRedirectAway', () => {
  it('redirects a paid user with no intent parameters', () => {
    const ents = { ...empty, smjer: ent(true, 'paddle') };
    expect(shouldForceRedirectAway({ plan: null, shop: false, checkoutSuccess: false }, ents)).toBe(true);
  });
  it('does NOT redirect when ?plan= is present (deliberate purchase intent)', () => {
    const ents = { ...empty, smjer: ent(true, 'paddle') };
    expect(shouldForceRedirectAway({ plan: 'komplet', shop: false, checkoutSuccess: false }, ents)).toBe(false);
  });
  it('does NOT redirect when ?shop=1 is present (browsing intent)', () => {
    const ents = { ...empty, krug: ent(true, 'trial') };
    expect(shouldForceRedirectAway({ plan: null, shop: true, checkoutSuccess: false }, ents)).toBe(false);
  });
  it('does NOT redirect during ?checkout=success poll', () => {
    const ents = { ...empty, smjer: ent(true, 'paddle') };
    expect(shouldForceRedirectAway({ plan: null, shop: false, checkoutSuccess: true }, ents)).toBe(false);
  });
  it('does not redirect a user with no entitlements even without intent', () => {
    expect(shouldForceRedirectAway({ plan: null, shop: false, checkoutSuccess: false }, empty)).toBe(false);
  });
});

describe('paywallGate.shouldExitOnCheckoutSuccess', () => {
  it('exits only when a NEW module activates vs mount snapshot', () => {
    const before = { ...empty, smjer: ent(true, 'paddle') };
    const after = { ...empty, smjer: ent(true, 'paddle'), krug: ent(true, 'paddle') };
    expect(shouldExitOnCheckoutSuccess(before, after)).toBe(true);
  });
  it('does not exit when the same set of modules is still active', () => {
    const same = { ...empty, smjer: ent(true, 'paddle') };
    expect(shouldExitOnCheckoutSuccess(same, same)).toBe(false);
  });
  it('does not exit when the user still has only their pre-existing entitlements', () => {
    const before = { ...empty, smjer: ent(true, 'trial') };
    const after = { ...empty, smjer: ent(true, 'trial') };
    expect(shouldExitOnCheckoutSuccess(before, after)).toBe(false);
  });
});

describe('paywallGate.needsKompletOverlapConfirm', () => {
  it('warns when user has active paddle single and buys Komplet', () => {
    const ents = { ...empty, krug: ent(true, 'paddle') };
    expect(needsKompletOverlapConfirm('komplet', ents)).toBe(true);
  });
  it('does NOT warn for trial-only single', () => {
    const ents = { ...empty, krug: ent(true, 'trial') };
    expect(needsKompletOverlapConfirm('komplet', ents)).toBe(false);
  });
  it('does NOT warn for admin_grant single', () => {
    const ents = { ...empty, krug: ent(true, 'admin_grant') };
    expect(needsKompletOverlapConfirm('komplet', ents)).toBe(false);
  });
  it('never warns for non-komplet plans', () => {
    const ents = { ...empty, krug: ent(true, 'paddle') };
    expect(needsKompletOverlapConfirm('krug', ents)).toBe(false);
    expect(needsKompletOverlapConfirm('smjer', ents)).toBe(false);
  });
  it('lists only overlapping paddle single modules', () => {
    const ents = {
      ...empty,
      smjer: ent(true, 'paddle'),
      krug: ent(true, 'trial'),
      projekti: ent(true, 'paddle'),
    };
    expect(overlappingPaddleModules(ents)).toEqual(['smjer', 'projekti']);
  });
});

describe('paywallGate.isPlanAlreadyActive', () => {
  it('marks a single-plan card active when that module is active from any source', () => {
    const ents = { ...empty, krug: ent(true, 'trial') };
    expect(isPlanAlreadyActive('krug', ents)).toBe(true);
    expect(isPlanAlreadyActive('smjer', ents)).toBe(false);
  });
  it('Komplet is active only when all three singles are active', () => {
    const partial = { ...empty, smjer: ent(true, 'paddle'), krug: ent(true, 'paddle') };
    expect(isPlanAlreadyActive('komplet', partial)).toBe(false);
    const full = {
      ...empty,
      smjer: ent(true, 'paddle'),
      krug: ent(true, 'paddle'),
      projekti: ent(true, 'paddle'),
    };
    expect(isPlanAlreadyActive('komplet', full)).toBe(true);
  });
});
