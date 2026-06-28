import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { E2E_USERS } from '../helpers/env';

// Flow 1: Signup → Onboarding (2 steps) → GuidedEntryView (Skeniraj / Unesi ručno)
// stays for all 3 guided events → after THRESHOLD the standard home renders.
// Runs WITHOUT storageState — we want a clean session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Flow 1 — Signup, onboarding, first event', () => {
  test.beforeEach(async () => {
    await resetUserByKey('onboarding');
  });

  test('completes onboarding and shows guided entry on dashboard', async ({ page }) => {
    test.skip(true, 'TODO: implement after onboarding data-testids land. Flow: 2-step onboarding (greeting → ready) → /home renders GuidedEntryView (Skeniraj + Unesi ručno) for events 0..2 → after 3rd event standard home renders.');
    await page.goto('/auth');
    // Fill auth form, complete 2-step onboarding, add 3 events via GuidedEntryView CTAs, assert standard home visible.
    expect(E2E_USERS.onboarding).toMatch(/e2e\+/);
  });
});
