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
    try {
      await signInAndPersist(page, key);

      // FAIL-FAST proof: navigate to `/app` and wait for the router to land
      // on `/home` before we persist storageState. If session hydration is
      // broken (wrong storage key, expired token, silent /auth redirect),
      // this throws HERE with a clear diagnostic dump — tests won't waste
      // 60s per scenario staring at Landing.
      await page.goto('/app', { waitUntil: 'domcontentloaded' });
      try {
        await page.waitForURL(/\/home(\?|$)/, { timeout: 120_000 });
      } catch (waitErr) {
        const url = page.url();
        const dump = await page
          .evaluate(() => {
            const keys: string[] = [];
            for (let i = 0; i < window.localStorage.length; i += 1) {
              const k = window.localStorage.key(i);
              if (k) keys.push(k);
            }
            const sbKey = keys.find((k) => /^sb-.*-auth-token$/.test(k));
            const raw = sbKey ? window.localStorage.getItem(sbKey) : null;
            let hasToken = false;
            let expiresAt: number | null = null;
            try {
              const p = raw ? JSON.parse(raw) : null;
              hasToken = !!(p && (p.access_token || p.currentSession?.access_token));
              expiresAt = p?.expires_at ?? p?.currentSession?.expires_at ?? null;
            } catch { /* noop */ }
            return {
              ls_keys: keys,
              sb_key: sbKey ?? null,
              sb_has_access_token: hasToken,
              sb_expires_at: expiresAt,
              storage_config: window.localStorage.getItem('finmate-storage-config'),
            };
          })
          .catch(() => ({}));
        // eslint-disable-next-line no-console
        console.error(
          `::error title=L3 globalSetup fail-fast::user=${key} landed_url=${url} auth=${JSON.stringify(dump)}`,
        );
        throw new Error(
          `layer3 globalSetup: user "${key}" did not reach /home within 120s (last url=${url}). Session hydration broken — see auth dump above.`,
        );
      }

      await ctx.storageState({ path: storageStatePath(key) });
    } finally {
      await browser.close();
    }
  }
}
