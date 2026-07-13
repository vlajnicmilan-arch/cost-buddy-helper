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
  await page.evaluate(
    ({ storageKey, session }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { storageKey, session },
  );
}
