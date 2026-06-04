import { describe, it, expect } from 'vitest';
import {
  formatBillingPlanLabel,
  deriveEffectiveAccess,
  summarizeModuleAccess,
  sortGrantsByLatestEvent,
  isGrantActive,
  isGrantExpiringSoon,
  getEarliestUpcomingExpiry,
  formatExpiryBadge,
  hoursUntilGrantExpiry,
  groupActiveGrantsByReason,
  filterGrantsByReason,
  grantReasonCodeI18nKey,
  GRANT_REASON_CODES,
  type ActiveGrantLike,
} from '@/lib/adminAccess';

const NOW = new Date('2026-06-04T12:00:00Z');
const future = (days: number) =>
  new Date(NOW.getTime() + days * 86400_000).toISOString();
const past = (days: number) =>
  new Date(NOW.getTime() - days * 86400_000).toISOString();

describe('formatBillingPlanLabel', () => {
  it('free → coreOnly', () => {
    expect(formatBillingPlanLabel('free')).toBe('admin.billing.planLabel.coreOnly');
  });
  it('pro → projects (bez riječi Pro u UI ključu)', () => {
    expect(formatBillingPlanLabel('pro')).toBe('admin.billing.planLabel.projects');
  });
  it('business → business', () => {
    expect(formatBillingPlanLabel('business')).toBe('admin.billing.planLabel.business');
  });
  it('null/undefined/empty → coreOnly', () => {
    expect(formatBillingPlanLabel(null)).toBe('admin.billing.planLabel.coreOnly');
    expect(formatBillingPlanLabel(undefined)).toBe('admin.billing.planLabel.coreOnly');
    expect(formatBillingPlanLabel('')).toBe('admin.billing.planLabel.coreOnly');
  });
  it('nepoznata vrijednost → coreOnly (defenzivno)', () => {
    expect(formatBillingPlanLabel('xyz')).toBe('admin.billing.planLabel.coreOnly');
  });
});

describe('isGrantActive', () => {
  it('aktivan: bez expires_at, bez revoked_at', () => {
    expect(isGrantActive({ revoked_at: null, expires_at: null }, NOW)).toBe(true);
  });
  it('aktivan: expires u budućnosti', () => {
    expect(isGrantActive({ revoked_at: null, expires_at: future(10) }, NOW)).toBe(true);
  });
  it('istekao: expires u prošlosti', () => {
    expect(isGrantActive({ revoked_at: null, expires_at: past(1) }, NOW)).toBe(false);
  });
  it('istekao: expires točno sada (rub uključen kao istekao)', () => {
    expect(
      isGrantActive({ revoked_at: null, expires_at: NOW.toISOString() }, NOW)
    ).toBe(false);
  });
  it('opozvan', () => {
    expect(
      isGrantActive({ revoked_at: past(1), expires_at: future(10) }, NOW)
    ).toBe(false);
  });
});

describe('deriveEffectiveAccess', () => {
  const u = 'u1';

  it('free + bez grantova → samo Core', () => {
    const a = deriveEffectiveAccess(u, 'free', [], NOW);
    expect(a.projects.has).toBe(false);
    expect(a.business.has).toBe(false);
  });

  it('pro → Projects kroz billing', () => {
    const a = deriveEffectiveAccess(u, 'pro', [], NOW);
    expect(a.projects.has).toBe(true);
    expect(a.projects.sources).toEqual(['billing']);
    expect(a.business.has).toBe(false);
  });

  it('business → Projects i Business kroz billing', () => {
    const a = deriveEffectiveAccess(u, 'business', [], NOW);
    expect(a.projects.sources).toEqual(['billing']);
    expect(a.business.sources).toEqual(['billing']);
  });

  it('free + projects override → Projects samo kroz override', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: u, module: 'projects', revoked_at: null, expires_at: future(30) },
    ];
    const a = deriveEffectiveAccess(u, 'free', grants, NOW);
    expect(a.projects.sources).toEqual(['override']);
    expect(a.business.has).toBe(false);
  });

  it('pro + projects override → oba izvora (billing + override)', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: u, module: 'projects', revoked_at: null, expires_at: null },
    ];
    const a = deriveEffectiveAccess(u, 'pro', grants, NOW);
    expect(a.projects.sources).toEqual(['billing', 'override']);
  });

  it('expired override ne računa se', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: u, module: 'business', revoked_at: null, expires_at: past(1) },
    ];
    const a = deriveEffectiveAccess(u, 'free', grants, NOW);
    expect(a.business.has).toBe(false);
  });

  it('revoked override ne računa se', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: u, module: 'business', revoked_at: past(1), expires_at: future(10) },
    ];
    const a = deriveEffectiveAccess(u, 'free', grants, NOW);
    expect(a.business.has).toBe(false);
  });

  it('grant drugog korisnika se ignorira', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: 'u2', module: 'projects', revoked_at: null, expires_at: null },
    ];
    const a = deriveEffectiveAccess(u, 'free', grants, NOW);
    expect(a.projects.has).toBe(false);
  });
});

describe('summarizeModuleAccess', () => {
  it('prazna lista → svi nula', () => {
    const s = summarizeModuleAccess([], {}, [], NOW);
    expect(s.coreTotal).toBe(0);
    expect(s.projects.total).toBe(0);
    expect(s.business.total).toBe(0);
  });

  it('samo billing', () => {
    const s = summarizeModuleAccess(
      ['a', 'b', 'c'],
      { a: 'pro', b: 'business', c: 'free' },
      [],
      NOW
    );
    expect(s.coreTotal).toBe(3);
    expect(s.projects.billing).toBe(2); // pro + business
    expect(s.projects.override).toBe(0);
    expect(s.projects.intersection).toBe(0);
    expect(s.projects.total).toBe(2);
    expect(s.business.billing).toBe(1);
    expect(s.business.total).toBe(1);
  });

  it('samo override', () => {
    const s = summarizeModuleAccess(
      ['a', 'b'],
      { a: 'free', b: 'free' },
      [
        { user_id: 'a', module: 'projects', revoked_at: null, expires_at: future(10) },
        { user_id: 'b', module: 'business', revoked_at: null, expires_at: null },
      ],
      NOW
    );
    expect(s.projects.billing).toBe(0);
    expect(s.projects.override).toBe(1);
    expect(s.projects.total).toBe(1);
    expect(s.business.override).toBe(1);
    expect(s.business.total).toBe(1);
    expect(s.projects.intersection).toBe(0);
  });

  it('presjek: korisnik ima i billing i override za isti modul', () => {
    const s = summarizeModuleAccess(
      ['a', 'b'],
      { a: 'pro', b: 'pro' },
      [
        { user_id: 'a', module: 'projects', revoked_at: null, expires_at: future(10) },
      ],
      NOW
    );
    expect(s.projects.billing).toBe(2);
    expect(s.projects.override).toBe(1);
    expect(s.projects.intersection).toBe(1);
    expect(s.projects.total).toBe(2); // union jedinstvenih
  });

  it('expired/revoked grantovi se ne broje', () => {
    const s = summarizeModuleAccess(
      ['a'],
      { a: 'free' },
      [
        { user_id: 'a', module: 'projects', revoked_at: null, expires_at: past(1) },
        { user_id: 'a', module: 'business', revoked_at: past(1), expires_at: null },
      ],
      NOW
    );
    expect(s.projects.override).toBe(0);
    expect(s.business.override).toBe(0);
  });

  it('grant korisnika koji NIJE u userIds listi se ignorira u override skupu', () => {
    const s = summarizeModuleAccess(
      ['a'],
      { a: 'free' },
      [{ user_id: 'unknown', module: 'projects', revoked_at: null, expires_at: null }],
      NOW
    );
    expect(s.projects.override).toBe(0);
    expect(s.projects.total).toBe(0);
  });
});

describe('sortGrantsByLatestEvent', () => {
  it('samo grant: sortira po granted_at DESC', () => {
    const rows = [
      { id: 'a', granted_at: past(3), revoked_at: null },
      { id: 'b', granted_at: past(1), revoked_at: null },
      { id: 'c', granted_at: past(2), revoked_at: null },
    ];
    const out = sortGrantsByLatestEvent(rows).map((r) => r.id);
    expect(out).toEqual(['b', 'c', 'a']);
  });

  it('revoke noviji od granta drugog reda: revoked dolazi prvi', () => {
    const rows = [
      { id: 'a', granted_at: past(10), revoked_at: past(1) }, // event=−1d
      { id: 'b', granted_at: past(5), revoked_at: null },     // event=−5d
    ];
    const out = sortGrantsByLatestEvent(rows).map((r) => r.id);
    expect(out).toEqual(['a', 'b']);
  });

  it('tie po vremenu → tie-breaker po id DESC', () => {
    const t = past(1);
    const rows = [
      { id: 'aaa', granted_at: t, revoked_at: null },
      { id: 'ccc', granted_at: t, revoked_at: null },
      { id: 'bbb', granted_at: t, revoked_at: null },
    ];
    const out = sortGrantsByLatestEvent(rows).map((r) => r.id);
    expect(out).toEqual(['ccc', 'bbb', 'aaa']);
  });

  it('ne mutira ulaz', () => {
    const rows = [
      { id: 'a', granted_at: past(2), revoked_at: null },
      { id: 'b', granted_at: past(1), revoked_at: null },
    ];
    const snapshot = JSON.stringify(rows);
    sortGrantsByLatestEvent(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
});

// ---------------------------------------------------------------------------
// PR2: expiring helpers
// ---------------------------------------------------------------------------

const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

describe('hoursUntilGrantExpiry', () => {
  it('null za perpetual', () => {
    expect(hoursUntilGrantExpiry({ expires_at: null }, NOW)).toBeNull();
  });
  it('pozitivno za budućnost', () => {
    expect(hoursUntilGrantExpiry({ expires_at: inHours(5) }, NOW)).toBeCloseTo(5, 5);
  });
  it('negativno za prošlost', () => {
    expect(hoursUntilGrantExpiry({ expires_at: inHours(-2) }, NOW)).toBeCloseTo(-2, 5);
  });
});

describe('isGrantExpiringSoon (threshold = 7d, strict rolling)', () => {
  const base = { user_id: 'u', module: 'projects' as const };

  it('perpetual → false', () => {
    expect(
      isGrantExpiringSoon({ ...base, revoked_at: null, expires_at: null }, NOW)
    ).toBe(false);
  });
  it('revoked → false', () => {
    expect(
      isGrantExpiringSoon({ ...base, revoked_at: past(1), expires_at: inHours(3) }, NOW)
    ).toBe(false);
  });
  it('rub 59min → true', () => {
    expect(
      isGrantExpiringSoon({ ...base, revoked_at: null, expires_at: inHours(59 / 60) }, NOW)
    ).toBe(true);
  });
  it('točno 1h → true', () => {
    expect(
      isGrantExpiringSoon({ ...base, revoked_at: null, expires_at: inHours(1) }, NOW)
    ).toBe(true);
  });
  it('1d → true', () => {
    expect(
      isGrantExpiringSoon({ ...base, revoked_at: null, expires_at: inHours(24) }, NOW)
    ).toBe(true);
  });
  it('točno 7d (= 168h) → false (strict)', () => {
    expect(
      isGrantExpiringSoon({ ...base, revoked_at: null, expires_at: inHours(168) }, NOW)
    ).toBe(false);
  });
  it('7d − 1s → true', () => {
    expect(
      isGrantExpiringSoon(
        { ...base, revoked_at: null, expires_at: inHours(168 - 1 / 3600) },
        NOW
      )
    ).toBe(true);
  });
  it('već istekao (0h) → false', () => {
    expect(
      isGrantExpiringSoon({ ...base, revoked_at: null, expires_at: inHours(0) }, NOW)
    ).toBe(false);
  });
  it('isteknut (-1h) → false', () => {
    expect(
      isGrantExpiringSoon({ ...base, revoked_at: null, expires_at: inHours(-1) }, NOW)
    ).toBe(false);
  });
});

describe('getEarliestUpcomingExpiry', () => {
  it('null kad nema match-a', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: 'u', module: 'projects', revoked_at: null, expires_at: null },
    ];
    expect(getEarliestUpcomingExpiry(grants, 'u', NOW)).toBeNull();
  });

  it('vraća najraniji od više expiring grantova istog usera', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: 'u', module: 'projects', revoked_at: null, expires_at: inHours(120) },
      { user_id: 'u', module: 'business', revoked_at: null, expires_at: inHours(36) },
      { user_id: 'u', module: 'projects', revoked_at: null, expires_at: inHours(10) },
    ];
    const out = getEarliestUpcomingExpiry(grants, 'u', NOW);
    expect(out).not.toBeNull();
    expect(Math.round((out!.getTime() - NOW.getTime()) / 3600_000)).toBe(10);
  });

  it('ignorira tuđe grantove', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: 'u2', module: 'projects', revoked_at: null, expires_at: inHours(3) },
    ];
    expect(getEarliestUpcomingExpiry(grants, 'u', NOW)).toBeNull();
  });

  it('ignorira perpetual i revoked', () => {
    const grants: ActiveGrantLike[] = [
      { user_id: 'u', module: 'projects', revoked_at: null, expires_at: null },
      { user_id: 'u', module: 'business', revoked_at: past(1), expires_at: inHours(2) },
    ];
    expect(getEarliestUpcomingExpiry(grants, 'u', NOW)).toBeNull();
  });
});

describe('formatExpiryBadge (4 buckets, bez decimala u UI)', () => {
  it('59min → expiresSoon', () => {
    expect(formatExpiryBadge(inHours(59 / 60), NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresSoon',
    });
  });

  it('1h → expiresToday', () => {
    expect(formatExpiryBadge(inHours(1), NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresToday',
    });
  });

  it('23h 59min → expiresToday', () => {
    expect(formatExpiryBadge(inHours(23 + 59 / 60), NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresToday',
    });
  });

  it('točno 24h → expiresInDay', () => {
    expect(formatExpiryBadge(inHours(24), NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresInDay',
    });
  });

  it('47h 59min → expiresInDay (još uvijek 1 dan, granica < 48h)', () => {
    expect(formatExpiryBadge(inHours(47 + 59 / 60), NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresInDay',
    });
  });

  it('48h → expiresInDays count 2', () => {
    expect(formatExpiryBadge(inHours(48), NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresInDays',
      params: { count: 2 },
    });
  });

  it('6d 23h → expiresInDays count 6 (floor)', () => {
    expect(formatExpiryBadge(inHours(6 * 24 + 23), NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresInDays',
      params: { count: 6 },
    });
  });

  it('prima Date objekt', () => {
    const d = new Date(NOW.getTime() + 3 * 86400_000);
    expect(formatExpiryBadge(d, NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresInDays',
      params: { count: 3 },
    });
  });

  it('negativan (defenzivno) → expiresSoon', () => {
    expect(formatExpiryBadge(inHours(-1), NOW)).toEqual({
      i18nKey: 'admin.users.expiry.expiresSoon',
    });
  });
});
});
