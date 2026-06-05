import { test, expect } from '@playwright/test';
import path from 'node:path';
import { resetUserByKey } from '../helpers/db';
import { storageStatePath } from '../helpers/auth';
import { tid } from '../helpers/selectors';

// Flow 5 SIMPLIFIED: CSV import + confirm import only.
// Manual ↔ bank merge / unmerge deferred to Sprint 3 (still covered by 20+ vitest tests).
test.use({ storageState: storageStatePath('import') });

test.describe('Flow 5 — CSV import basic', () => {
  test.beforeEach(async () => {
    await resetUserByKey('import');
  });

  test('uploads CSV and confirms 3 rows imported', async ({ page }) => {
    test.skip(true, 'TODO Sprint 2: implement after import dialog data-testids land.');
    await page.goto('/');
    await page.getByTestId(tid.importOpenButton).click();
    await page.getByTestId(tid.importFileInput).setInputFiles(
      path.join(__dirname, '../fixtures/import-3-rows.csv'),
    );
    await page.getByTestId(tid.importConfirmButton).click();
    await expect(page.getByTestId(tid.importBatchRow)).toHaveCount(1);
  });
});
