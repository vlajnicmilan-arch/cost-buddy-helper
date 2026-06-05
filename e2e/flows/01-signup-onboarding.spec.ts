import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { E2E_USERS } from '../helpers/env';

// Flow 1: Signup → Onboarding → First expense
// Runs WITHOUT storageState — we want a clean session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Flow 1 — Signup, onboarding, first expense', () => {
  test.beforeEach(async () => {
    await resetUserByKey('onboarding');
  });

  test('completes onboarding and shows first expense on dashboard', async ({ page }) => {
    test.skip(true, 'TODO Sprint 2: implement after onboarding data-testids land.');
    await page.goto('/auth');
    // Fill auth form, complete 5-step onboarding, add first expense, assert dashboard.
    expect(E2E_USERS.onboarding).toMatch(/e2e\+/);
  });
});
