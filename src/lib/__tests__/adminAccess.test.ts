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
});
