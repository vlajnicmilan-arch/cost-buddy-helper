import { chromium, type FullConfig } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resetUserByKey } from './helpers/db';
import { signInAndPersist, storageStatePath } from './helpers/auth';
import { L3_USERS, type L3UserKey } from './helpers/env';

export default async function globalSetup(_config: FullConfig) {
  await mkdir('stress/layer3-e2e-under-load/.auth', { recursive: true });

  const keys = Object.keys(L3_USERS) as L3UserKey[];
  for (const key of keys) {
    await resetUserByKey(key);
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInAndPersist(page, key);
    await ctx.storageState({ path: storageStatePath(key) });
    await browser.close();
  }
}
