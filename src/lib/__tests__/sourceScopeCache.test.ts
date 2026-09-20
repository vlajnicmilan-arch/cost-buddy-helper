/**
 * Dijeljeni doseg novčanika: nova instanca nikad ne kreće s praznom mapom.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readSourceScope,
  writeSourceScope,
  subscribeSourceScope,
  seedFromPaymentSourcesCache,
  __resetSourceScopeCacheForTests,
} from '@/lib/sourceScopeCache';
import { instantCache } from '@/lib/instantCache';
import { applyViewModeFilter } from '@/lib/viewModeScope';

const USER = 'd4d31ee6-5f6b-4059-8c87-b595b394f56b';
const BP = '804499a9-745c-42f8-930b-2209fcbd12a8';
const OWN = 'aaaa1111-0000-0000-0000-000000000001';
const BIZ = '3553da1e-152f-40e9-8597-77c7c959848d';
const FOREIGN = 'ffffffff-0000-0000-0000-000000000009';

const scope = (map: [string, string | null][], own: [string, string | null][]) => ({
  sourceBusinessMap: new Map(map),
  sharedIds: new Set(map.map(([id]) => id)),
  fullIds: new Set(own.map(([id]) => id)),
  ownedIncomeIds: new Set<string>(),
  ownSourceMap: new Map(own),
});

describe('sourceScopeCache', () => {
  beforeEach(() => {
    __resetSourceScopeCacheForTests();
    instantCache.clearAll();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('bez ičega vraća prazan doseg', () => {
    const s = readSourceScope(USER);
    expect(s.sourceBusinessMap.size).toBe(0);
    expect(s.fromSnapshot).toBe(true);
  });

  it('zapisani doseg čita svaka nova instanca sinkrono', () => {
    writeSourceScope(USER, scope([[OWN, null], [BIZ, BP]], [[OWN, null], [BIZ, BP]]));
    const s = readSourceScope(USER);
    expect(s.sourceBusinessMap.get(BIZ)).toBe(BP);
    expect(s.fromSnapshot).toBe(false);
  });

  it('nakon pada modul-cachea doseg se vraća iz trajne snimke', () => {
    writeSourceScope(USER, scope([[OWN, null]], [[OWN, null]]));
    __resetSourceScopeCacheForTests();
    expect(readSourceScope(USER).sourceBusinessMap.has(OWN)).toBe(true);
  });

  it('rezerva: snimka popisa novčanika daje vlastite novčanike', () => {
    instantCache.write(`paymentSources:v1:${USER}:personal:excl`, [
      { id: OWN, user_id: USER, business_profile_id: null },
      { id: FOREIGN, user_id: 'netko-drugi', business_profile_id: null },
    ]);
    const seeded = seedFromPaymentSourcesCache(USER)!;
    expect(seeded.ownSourceMap.has(OWN)).toBe(true);
    expect(seeded.ownSourceMap.has(FOREIGN)).toBe(false);
    expect(readSourceScope(USER).ownSourceMap.has(OWN)).toBe(true);
  });

  it('pretplatnici dobiju osvježeni doseg', () => {
    let seen = 0;
    const off = subscribeSourceScope(USER, (s) => { seen = s.sourceBusinessMap.size; });
    writeSourceScope(USER, scope([[OWN, null], [BIZ, BP]], [[OWN, null]]));
    off();
    expect(seen).toBe(2);
  });
});

describe('prazna mrežna mapa + snimka vlastitih novčanika', () => {
  const row = (ps: string, bp: string | null = null) => ({
    payment_source: `custom:${ps}`,
    type: 'expense',
    business_profile_id: bp,
  });

  it('vlastiti redci vidljivi, tuđi skriveni', () => {
    const visible = applyViewModeFilter([row(OWN), row(FOREIGN)], {
      isPersonalView: true,
      isBusinessView: false,
      viewBusinessProfileId: null,
      sourceBusinessMap: new Map(),
      ownSourceMap: new Map([[OWN, null]]),
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].payment_source).toBe(`custom:${OWN}`);
  });

  it('firmin novčanik iz snimke ostaje skriven u osobnom pogledu', () => {
    const visible = applyViewModeFilter([row(BIZ)], {
      isPersonalView: true,
      isBusinessView: false,
      viewBusinessProfileId: null,
      sourceBusinessMap: new Map(),
      ownSourceMap: new Map([[BIZ, BP]]),
    });
    expect(visible).toHaveLength(0);
  });

  it('bez mape i bez snimke sve custom ostaje skriveno', () => {
    expect(
      applyViewModeFilter([row(OWN)], {
        isPersonalView: true,
        isBusinessView: false,
        viewBusinessProfileId: null,
        sourceBusinessMap: new Map(),
      }),
    ).toHaveLength(0);
  });
});
