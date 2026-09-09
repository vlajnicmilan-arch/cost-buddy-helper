import { describe, it, expect } from 'vitest';
import {
  ADMIN_ENTITLEMENT_MODULES,
  buildSetEntitlementPayload,
  deriveModuleState,
  expiryToIso,
  normalizeSource,
  type EntitlementRowLike,
} from '@/lib/adminEntitlements';

const NOW = new Date('2026-09-09T12:00:00Z');

describe('admin prava po modulu', () => {
  it('pokriva svih pet modula', () => {
    expect(ADMIN_ENTITLEMENT_MODULES).toEqual([
      'smjer', 'krug', 'projekti', 'biznis', 'mail_uvoz',
    ]);
  });

  it('uključivanje šalje admin_grant payload s ISO istekom', () => {
    expect(
      buildSetEntitlementPayload({ userId: 'u1', module: 'krug', enabled: true, expiresAt: '2026-12-31' }),
    ).toEqual({ user_id: 'u1', module: 'krug', enabled: true, period_end: '2026-12-31T23:59:59.000Z' });
  });

  it('uključivanje bez datuma je trajno', () => {
    expect(
      buildSetEntitlementPayload({ userId: 'u1', module: 'smjer', enabled: true, expiresAt: '' }).period_end,
    ).toBeNull();
  });

  it('isključivanje nikad ne šalje istek', () => {
    expect(
      buildSetEntitlementPayload({ userId: 'u1', module: 'biznis', enabled: false, expiresAt: '2026-12-31' }),
    ).toEqual({ user_id: 'u1', module: 'biznis', enabled: false, period_end: null });
  });

  it('neispravan datum ne postaje istek', () => {
    expect(expiryToIso('nije-datum')).toBeNull();
  });

  it('stanje prikazuje izvor aktivnog prava', () => {
    const rows: EntitlementRowLike[] = [
      { module: 'krug', source: 'admin_grant', status: 'active', period_end: null },
      { module: 'krug', source: 'trial', status: 'expired', period_end: '2026-01-01T00:00:00Z' },
    ];
    const s = deriveModuleState(rows, 'krug', NOW);
    expect(s.active).toBe(true);
    expect(s.source).toBe('admin_grant');
    expect(s.adminGrantActive).toBe(true);
  });

  it('paddle ima prednost nad admin grantom u prikazu izvora', () => {
    const rows: EntitlementRowLike[] = [
      { module: 'smjer', source: 'admin_grant', status: 'active', period_end: null },
      { module: 'smjer', source: 'paddle', status: 'active', period_end: null },
    ];
    expect(deriveModuleState(rows, 'smjer', NOW).source).toBe('paddle');
  });

  it('opozvan admin_grant gasi prekidač', () => {
    const rows: EntitlementRowLike[] = [
      { module: 'projekti', source: 'admin_grant', status: 'revoked', period_end: null },
    ];
    const s = deriveModuleState(rows, 'projekti', NOW);
    expect(s.adminGrantActive).toBe(false);
    expect(s.active).toBe(false);
  });

  it('istekli period gasi pravo', () => {
    const rows: EntitlementRowLike[] = [
      { module: 'biznis', source: 'admin_grant', status: 'active', period_end: '2026-08-01T00:00:00Z' },
    ];
    expect(deriveModuleState(rows, 'biznis', NOW).active).toBe(false);
  });

  it('legacy redak otključava smjer/krug/projekti, ali ne biznis', () => {
    const rows: EntitlementRowLike[] = [
      { module: 'business_legacy', source: 'migration', status: 'active', period_end: null },
    ];
    expect(deriveModuleState(rows, 'projekti', NOW).active).toBe(true);
    expect(deriveModuleState(rows, 'biznis', NOW).active).toBe(false);
  });

  it('normalizacija izvora', () => {
    expect(normalizeSource('pro_legacy')).toBe('legacy');
    expect(normalizeSource(null)).toBeNull();
  });
});
