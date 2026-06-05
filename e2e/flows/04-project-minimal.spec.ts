import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { storageStatePath } from '../helpers/auth';
import { tid } from '../helpers/selectors';

// Flow 4 MINIMAL: create project (with preset) → add 1 milestone → mark done.
// Asserts: actual_end_date populated AND completed_at not reset on subsequent updates.
// Full completion wizard / reopen / readonly gate deferred to Sprint 3.
test.use({ storageState: storageStatePath('core') });

test.describe('Flow 4 (minimal) — Project + milestone done', () => {
  test.beforeEach(async () => {
    await resetUserByKey('core');
  });

  test('milestone completion sets actual_end_date and persists across updates', async ({ page }) => {
    test.skip(true, 'TODO Sprint 2: implement after project + milestone data-testids land.');
    await page.goto('/');
    // Create project with preset, add milestone, mark done, assert actual_end_date badge,
    // then trigger an unrelated update and assert completed_at is preserved.
    expect(tid.projectCreateButton).toBeTruthy();
  });
});
