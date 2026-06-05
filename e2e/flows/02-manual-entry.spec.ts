import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { storageStatePath } from '../helpers/auth';
import { tid } from '../helpers/selectors';

// Flow 2 — Najkritičniji core loop: ručni unos → prikaz u listi → soft delete → UNDO
// (vidi mem://features/e2e-test-suite)
test.use({ storageState: storageStatePath('core') });

test.describe('Flow 2 — Manual entry, soft delete, undo', () => {
  test.beforeEach(async () => {
    await resetUserByKey('core');
  });

  test('add expense → delete via detail dialog → undo restores it', async ({ page }) => {
    const description = `E2E manual ${Date.now()}`;

    await page.goto('/');

    // FAB → otvara globalni AddExpenseDialog u manual modu
    await page.getByTestId(tid.addExpenseFab).first().click();

    await page.getByTestId(tid.manualExpenseAmount).fill('12.34');
    await page.getByTestId(tid.manualExpenseDescription).fill(description);
    await page.getByTestId(tid.manualExpenseSubmit).click();

    // Red se pojavljuje u listi
    const row = page.getByTestId(tid.transactionRow).filter({ hasText: description });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Klik na red otvara TransactionDetailDialog
    await row.click();

    // Delete iz dialoga → soft delete s UNDO toastom (10s)
    await page.getByTestId(tid.transactionDeleteAction).click();

    // Red nestaje iz liste
    await expect(row).toHaveCount(0, { timeout: 5_000 });

    // UNDO gumb u toastu → restore
    const undoButton = page.getByTestId(tid.undoToastButton);
    await expect(undoButton).toBeVisible({ timeout: 5_000 });
    await undoButton.click();

    // Red je natrag u listi
    await expect(row).toBeVisible({ timeout: 10_000 });
  });
});
