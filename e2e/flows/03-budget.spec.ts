import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { storageStatePath } from '../helpers/auth';
import { tid } from '../helpers/selectors';

// Flow 3: Create budget → record expense in category → assert burn %
test.use({ storageState: storageStatePath('core') });

test.describe('Flow 3 — Budget burn updates after expense', () => {
  test.beforeEach(async () => {
    await resetUserByKey('core');
  });

  test('budget card shows correct burn % after expense', async ({ page }) => {
    test.skip(true, 'TODO Sprint 2: implement after budget + expense data-testids land.');
    await page.goto('/budgets');
    await page.getByTestId(tid.budgetCreateButton).click();
    await page.getByTestId(tid.budgetNameInput).fill('E2E Hrana');
    await page.getByTestId(tid.budgetAmountInput).fill('100');
    await page.getByTestId(tid.budgetSaveButton).click();
    await expect(page.getByTestId(tid.budgetCard).filter({ hasText: 'E2E Hrana' })).toBeVisible();
    // ... add expense in matching category, assert burn %.
  });
});
