import type { Page, APIRequestContext } from '@playwright/test';
import { request as pwRequest } from '@playwright/test';
import { env, L3_USERS, type L3UserKey } from './env';

export function storageStatePath(key: L3UserKey): string {
  return `stress/layer3-e2e-under-load/.auth/${key}.json`;
}

export function storageKeyForLocal(): string {
  // Supabase-js key format: `sb-<projectRef>-auth-token`. For local stack
  // (127.0.0.1:54321) the client derives ref from the host's first label → "127".
  const projectRef = new URL(env.supabaseUrl).host.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}

type GoTrueSession = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
  user: unknown;
};

async function passwordGrant(
  req: APIRequestContext,
  email: string,
): Promise<GoTrueSession> {
  const res = await req.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
    data: { email, password: env.password },
  });
  if (!res.ok()) {
    throw new Error(`layer3 sign-in failed (${res.status()}): ${await res.text()}`);
  }
  const s = (await res.json()) as GoTrueSession;
  // GoTrue returns expires_in; expires_at is often undefined which forces
  // supabase-js to treat the token as immediately expired → triggers refresh
  // (which rotates and invalidates the token we just injected). Compute it.
  if (!s.expires_at) {
    s.expires_at = Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600);
  }
  return s;
}

/**
 * PER-TEST fresh session (avoids refresh-token rotation collisions from
 * shared storageState). Runs a password grant against local GoTrue and
 * installs the session via `addInitScript` so it lands in localStorage
 * BEFORE the app bundle boots — no window where _recoverAndRefresh sees a
 * rotated/used refresh token.
 *
 * Call in `beforeEach` AFTER `resetUserByKey` (which ensures the user
 * exists) and BEFORE any `page.goto(...)`.
 */
export async function signInFresh(page: Page, key: L3UserKey): Promise<GoTrueSession> {
  const email = L3_USERS[key];
  const session = await passwordGrant(page.request, email);
  const storageKey = storageKeyForLocal();
  const storageConfig = { mode: 'cloud', lastSync: new Date().toISOString() };
  // Consent verbatim mirror of src/lib/consentManager.ts (CONSENT_KEY='cookie_consent_v2',
  // CONSENT_VERSION=1). Rejecting analytics+marketing = "necessary only" = same as user
  // clicking "Odbij sve". This dismisses CookieConsentBanner before it can overlay the
  // submit button (banner has a 1000s delay + intercepts pointer events on click).
  const consent = {
    necessary: true,
    analytics: false,
    marketing: false,
    decidedAt: new Date().toISOString(),
    version: 1,
  };
  await page.addInitScript(
    ({ storageKey, session, storageConfig, consent }) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(session));
        window.localStorage.setItem('finmate-storage-config', JSON.stringify(storageConfig));
        window.localStorage.setItem('onboarding_completed', 'true');
        window.localStorage.setItem('projects_module_enabled', 'true');
        window.localStorage.setItem('cookie_consent_v2', JSON.stringify(consent));
      } catch { /* incognito/blocked storage — surfaced by the app */ }
    },
    { storageKey, session, storageConfig, consent },
  );
  return session;
}

/**
 * Global-setup smoke variant: writes the session into an isolated context's
 * localStorage so the fail-fast `/app → /home` walk can execute. NOT used
 * to persist storageState for tests — tests mint their own via signInFresh.
 */
export async function signInAndPersist(page: Page, key: L3UserKey): Promise<void> {
  const email = L3_USERS[key];
  const req = await pwRequest.newContext();
  try {
    const session = await passwordGrant(req, email);
    const storageKey = storageKeyForLocal();
    const storageConfig = { mode: 'cloud', lastSync: new Date().toISOString() };
    const consent = { necessary: true, analytics: false, marketing: false, decidedAt: new Date().toISOString(), version: 1 };
    await page.addInitScript(
      ({ storageKey, session, storageConfig, consent }) => {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(session));
          window.localStorage.setItem('finmate-storage-config', JSON.stringify(storageConfig));
          window.localStorage.setItem('onboarding_completed', 'true');
          window.localStorage.setItem('projects_module_enabled', 'true');
          window.localStorage.setItem('cookie_consent_v2', JSON.stringify(consent));
        } catch { /* noop */ }
      },
      { storageKey, session, storageConfig, consent },
    );
  } finally {
    await req.dispose();
  }
}
