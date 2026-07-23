import { defineConfig } from '@playwright/test';

/**
 * Security adversarial suite — čisti API testovi kroz @supabase/supabase-js.
 * Runa se odvojeno od funkcijskih e2e testova (npm run test:security).
 * NE koristi browser, NE koristi web server.
 *
 * Zahtijeva ENV:
 *   E2E_SUPABASE_URL
 *   E2E_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_USER_PASSWORD
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e/security/specs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: isCI ? [['github'], ['list']] : [['list']],
  globalSetup: './e2e/security/global-setup.ts',
  globalTeardown: './e2e/security/global-teardown.ts',
  use: {
    // No browser needed — svi testovi rade direktnim HTTP-om
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
