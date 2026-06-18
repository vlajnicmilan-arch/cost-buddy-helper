import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { E2E_USERS } from '../helpers/env';

// Flow 1: Signup → Onboarding (2 steps) → ZeroDataQuietState → first expense → GuidedHomeView.
// Runs WITHOUT storageState — we want a clean session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Flow 1 — Signup, onboarding, first expense', () => {
  test.beforeEach(async () => {
    await resetUserByKey('onboarding');
  });

  test('completes onboarding and shows first expense on dashboard', async ({ page }) => {
    test.skip(true, 'TODO: implement after onboarding data-testids land. Flow: 2-step onboarding (greeting → ready) → /home renders ZeroDataQuietState (0 unosa) → log first expense → /home renders GuidedHomeView (week strip + last transaction).');
    await page.goto('/auth');
    // Fill auth form, complete 2-step onboarding, add first expense, assert GuidedHomeView visible.
    expect(E2E_USERS.onboarding).toMatch(/e2e\+/);
  });
});
