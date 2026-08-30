/**
 * Brana: besplatan račun je besplatan zauvijek.
 *
 * Korisnik u oblaku bez ijednog aktivnog prava i stariji od 30 dana od
 * registracije NE SMIJE biti globalno preusmjeren na /paywall. Naplata
 * ostaje isključivo po modulima (entitlements + write guardovi).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('nema globalnog zaključavanja u App.tsx', () => {
  const app = read('src/App.tsx');

  it('ne postoji catch-all preusmjeravanje na /paywall', () => {
    expect(app).not.toMatch(/Navigate to="\/paywall"/);
  });

  it('routing ne čita trialExpired', () => {
    expect(app).not.toMatch(/trialExpired/);
  });

  it('/paywall ostaje dostupna ruta (tijek kupnje netaknut)', () => {
    expect(app).toMatch(/path="\/paywall"/);
  });
});

describe('SubscriptionContext nema naslijeđeni istek iz created_at', () => {
  const ctx = read('src/contexts/SubscriptionContext.tsx');

  it('ne računa trial iz user.created_at', () => {
    expect(ctx).not.toMatch(/created_at/);
    expect(ctx).not.toMatch(/TRIAL_DURATION_DAYS/);
  });

  it('trialExpired više ne postoji', () => {
    expect(ctx).not.toMatch(/trialExpired/);
  });

  it('trial se izvodi samo iz user_entitlements (source="trial")', () => {
    expect(ctx).toMatch(/source === 'trial'/);
  });
});

describe('naplata po modulima nije oslabljena', () => {
  it('useFeatureAccess i dalje traži entitlement po modulu', () => {
    const fa = read('src/hooks/useFeatureAccess.ts');
    expect(fa).toMatch(/hasModuleAccess/);
    expect(fa).toMatch(/entitlements\[module\]\?\.active/);
  });

  it('useWriteGuard i dalje blokira pisanje bez prava i nudi nadogradnju', () => {
    const wg = read('src/hooks/useWriteGuard.ts');
    expect(wg).toMatch(/access\.moduleBlocked/);
    expect(wg).toMatch(/free_limit_exceeded/);
    expect(wg).toMatch(/navigate\('\/paywall'\)/);
  });
});
