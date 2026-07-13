import type { Page } from '@playwright/test';
import { env, L3_USERS, type L3UserKey } from './env';

export function storageStatePath(key: L3UserKey): string {
  return `stress/layer3-e2e-under-load/.auth/${key}.json`;
}

/**
 * Password grant against LOCAL GoTrue, then write session into localStorage
 * so app picks it up on next navigation. Mirrors e2e/helpers/auth.ts pattern
 * but scoped to layer 3's local stack.
 */
export async function signInAndPersist(page: Page, key: L3UserKey): Promise<void> {
  const email = L3_USERS[key];
  const res = await page.request.post(
    `${env.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
      data: { email, password: env.password },
    },
  );
  if (!res.ok()) {
    throw new Error(`layer3 sign-in failed (${res.status()}): ${await res.text()}`);
  }
  const session = await res.json();

  await page.goto('/');
  const projectRef = new URL(env.supabaseUrl).host.split('.')[0]; // 127 for local
  const storageKey = `sb-${projectRef}-auth-token`;
  // Also seed `finmate-storage-config` — RootRoute/getAppEntryRoute otherwise
  // sends a logged-in user to `/setup` (storageMode null), so `/home` never
  // mounts and neither `summary-balance` nor `nav-projects` renders.
  const storageConfig = { mode: 'cloud', lastSync: new Date().toISOString() };
  await page.evaluate(
    ({ storageKey, session, storageConfig }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
      window.localStorage.setItem('finmate-storage-config', JSON.stringify(storageConfig));
      // Mirror the profile flags AppStateContext hydrates from the server so the
      // very first render already knows onboarding is done and the projects
      // module is on — otherwise the guarded routes flash `/onboarding` and the
      // BottomNav renders without `nav-projects`.
      window.localStorage.setItem('onboarding_completed', 'true');
      window.localStorage.setItem('projects_module_enabled', 'true');
    },
    { storageKey, session, storageConfig },
  );
}
