import { defineConfig, devices } from '@playwright/test';

/**
 * Layer 3 (E2E under k6 load) — LOCAL STACK ONLY.
 * Bootstrap + preview server + k6 background are orchestrated by
 * stress/bin/run-all.sh --layer=3 (this config does NOT own webServer).
 *
 * Prod isolation:
 *  - baseURL defaults to 127.0.0.1:4173 (Vite preview built with local env vars)
 *  - helpers/env.ts refuses remote Supabase hosts at module scope
 *  - run-all.sh greps dist/ for prod project ref before starting Playwright
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './flows',
  timeout: 120_000,          // higher: system under k6 load
  expect: { timeout: 15_000 },
  fullyParallel: false,      // serialise: shared local DB + shared k6 pressure
  workers: 1,
  retries: 0,                // truth verdict, no retry masking
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: '../reports/layer3-report' }], ['list']]
    : [['list'], ['html', { open: 'never', outputFolder: '../reports/layer3-report' }]],
  outputDir: '../reports/layer3-artifacts',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 384, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'hr-HR',
    timezoneId: 'Europe/Zagreb',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 384, height: 800 } },
    },
  ],
});
