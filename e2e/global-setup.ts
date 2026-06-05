import { chromium, type FullConfig } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resetUserByKey } from './helpers/db';
import { signInAndPersist, storageStatePath } from './helpers/auth';
import { E2E_USERS, type E2EUserKey } from './helpers/env';

export default async function globalSetup(_config: FullConfig) {
  await mkdir('e2e/.auth', { recursive: true });

  const keys = Object.keys(E2E_USERS) as E2EUserKey[];
  for (const key of keys) {
    // Wipe & re-seed profile flag
    await resetUserByKey(key);

    // Persist auth state for tests that opt into it (Flow 1 onboarding does NOT)
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInAndPersist(page, key);
    await ctx.storageState({ path: storageStatePath(key) });
    await browser.close();
  }
}
