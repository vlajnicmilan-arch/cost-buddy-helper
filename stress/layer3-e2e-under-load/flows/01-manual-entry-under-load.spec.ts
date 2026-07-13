import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { storageStatePath } from '../helpers/auth';
import { registerOnFailureDiagnostics } from '../helpers/onFailureDiag';

registerOnFailureDiagnostics();

/**
 * Scenario 1 — Ručni unos troška DOK k6 (30VU small) tuče backend.
 *
 * Assertion po mandatu:
 *   1. Transaction row s opisom mora biti vidljiv u listi.
 *   2. Saldo (data-testid="summary-balance") mora pasti TOČNO za iznos
 *      unešenog troška (start_balance - amount = end_balance).
 *      Ovo je "sadržajan" assertion, ne samo prisutnost reda.
 */
test.use({ storageState: storageStatePath('primary') });

// Testids mirror src/components; kept inline to avoid depending on e2e/ helpers.
const TID = {
  addExpenseFab: 'add-expense-fab',
  manualExpenseAmount: 'manual-expense-amount',
  manualExpenseDescription: 'manual-expense-description',
  manualExpenseSubmit: 'manual-expense-submit',
  transactionRow: 'transaction-row',
  summaryBalance: 'summary-balance',
} as const;

test.describe('Layer 3 / Scenario 1 — manual entry under k6 load', () => {
  test.beforeEach(async () => {
    await resetUserByKey('primary');
  });

  test('add expense → row visible → balance drops by exact amount', async ({ page }) => {
    const description = `L3-manual-${Date.now()}`;
    const amount = 12.34;

    await page.goto('/');

    // Read starting balance from UI (parsed from summary-balance).
    const balanceEl = page.getByTestId(TID.summaryBalance).first();
    await expect(balanceEl).toBeVisible({ timeout: 60_000 });
    const startText = (await balanceEl.textContent()) ?? '';
    const startBalance = parseHrCurrency(startText);

    // Add expense via FAB → global AddExpenseDialog (manual mode).
    await page.getByTestId(TID.addExpenseFab).first().click();
    await page.getByTestId(TID.manualExpenseAmount).fill(String(amount));
    await page.getByTestId(TID.manualExpenseDescription).fill(description);
    await page.getByTestId(TID.manualExpenseSubmit).click();

    // Row appears in the list.
    const row = page.getByTestId(TID.transactionRow).filter({ hasText: description });
    await expect(row).toBeVisible({ timeout: 60_000 });

    // Balance UI reflects the exact drop (poll — under load re-render can lag).
    await expect
      .poll(
        async () => {
          const txt = (await balanceEl.textContent()) ?? '';
          return parseHrCurrency(txt);
        },
        {
          message: `balance must drop from ${startBalance} by exactly ${amount}`,
          timeout: 60_000,
          intervals: [500, 1000, 2000],
        },
      )
      .toBeCloseTo(startBalance - amount, 2);
  });
});

/**
 * Parse hr-HR currency string ("−1.234,56 €", "12,34 kn", etc.) → number.
 * Handles unicode minus, thousand-sep dots/spaces, decimal comma.
 */
function parseHrCurrency(s: string): number {
  const cleaned = s
    .replace(/\u2212/g, '-') // unicode minus → ASCII
    .replace(/[^0-9,.\-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // strip thousand-sep dots
    .replace(',', '.');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`layer3: could not parse currency from "${s}"`);
  }
  return n;
}
