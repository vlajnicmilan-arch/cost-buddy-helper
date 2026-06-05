import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { storageStatePath } from '../helpers/auth';
import { tid } from '../helpers/selectors';

// Flow 2: Manual expense entry → list update → soft delete → UNDO
test.use({ storageState: storageStatePath('core') });

test.describe('Flow 2 — Manual entry, soft delete, undo', () => {
  test.beforeEach(async () => {
    await resetUserByKey('core');
  });

  test('add expense → delete → undo restores it', async ({ page }) => {
    test.skip(true, 'TODO Sprint 2: implement after data-testids on add-expense FAB / list row.');
    await page.goto('/');
    await page.getByTestId(tid.addExpenseFab).click();
    await page.getByTestId(tid.manualExpenseAmount).fill('12.34');
    await page.getByTestId(tid.manualExpenseDescription).fill('E2E manual entry');
    await page.getByTestId(tid.manualExpenseSubmit).click();

    const row = page.getByTestId(tid.transactionRow).filter({ hasText: 'E2E manual entry' });
    await expect(row).toBeVisible();

    await row.getByTestId(tid.transactionDeleteAction).click();
    await expect(row).toHaveCount(0);

    await page.getByTestId(tid.undoToastButton).click();
    await expect(row).toBeVisible();
  });
});
