import type { Page } from '@playwright/test';
import { env, E2E_USERS, type E2EUserKey } from './env';

export function storageStatePath(key: E2EUserKey): string {
  return `e2e/.auth/${key}.json`;
}

/**
 * Programmatic sign-in via Supabase auth REST endpoint, then persist tokens to
 * localStorage so the app picks them up on next navigation. Avoids brittle
 * form-fill flow inside global-setup.
 */
export async function signInAndPersist(page: Page, key: E2EUserKey): Promise<void> {
  const email = E2E_USERS[key];
  const res = await page.request.post(
    `${env.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: env.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      data: { email, password: env.password },
    },
  );
  if (!res.ok()) {
    throw new Error(`E2E sign-in failed (${res.status()}): ${await res.text()}`);
  }
  const session = await res.json();

  await page.goto('/');
  // Storage key mirrors @supabase/supabase-js v2 default (`sb-<ref>-auth-token`).
  const projectRef = new URL(env.supabaseUrl).host.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await page.evaluate(
    ({ storageKey, session }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { storageKey, session },
  );
}
