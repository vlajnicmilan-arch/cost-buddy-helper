import { chromium, type FullConfig } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resetUserByKey } from './helpers/db';
import { signInAndPersist, storageStatePath } from './helpers/auth';
import { env, L3_USERS, type L3UserKey } from './helpers/env';

export default async function globalSetup(_config: FullConfig) {
  await mkdir('stress/layer3-e2e-under-load/.auth', { recursive: true });

  // Playwright's config `use.baseURL` does NOT propagate to contexts we
  // create manually here — pass it explicitly so `page.goto('/')` inside
  // signInAndPersist resolves against the local preview.
  const baseURL = env.baseUrl;

  const keys = Object.keys(L3_USERS) as L3UserKey[];
  for (const key of keys) {
    await resetUserByKey(key);
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await signInAndPersist(page, key);
    await ctx.storageState({ path: storageStatePath(key) });
    await browser.close();
  }
}
