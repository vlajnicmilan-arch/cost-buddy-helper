import { test, expect } from '@playwright/test';
import { resetUserByKey } from '../helpers/db';
import { signInFresh } from '../helpers/auth';
import { registerOnFailureDiagnostics } from '../helpers/onFailureDiag';

registerOnFailureDiagnostics();

/**
 * Scenario 2 — Project create + milestone add pod k6 loadom.
 *
 * PER-TEST session via signInFresh + addInitScript (no shared storageState).
 * See spec 01 header for the refresh-token-rotation rationale.
 *
 * NAPOMENA (za sud): Prvotni prijedlog je bio "Krug approve tok", ali Krug
 * UI trenutno NEMA stabilnih data-testid selektora. Umjesto dodavanja
 * testid-ova u pola Krug ekrana, pokriveni je project write tok — druga
 * kritična write ruta, već ima kompletan `tid` katalog u src/.
 */

const TID = {
  bottomNavProjects: 'nav-projects',
  projectCreateButton: 'project-create',
  projectNameInput: 'project-name',
  projectSaveButton: 'project-save',
  milestoneAddButton: 'milestone-add',
  milestoneNameInput: 'milestone-name',
  milestoneSaveButton: 'milestone-save',
  milestoneRow: 'milestone-row',
} as const;

test.describe('Layer 3 / Scenario 2 — project + milestone under k6 load', () => {
  test.beforeEach(async ({ page }) => {
    await resetUserByKey('primary');
    await signInFresh(page, 'primary');
  });

  test('create project → add milestone → milestone row visible', async ({ page }) => {
    const projectName = `L3-proj-${Date.now()}`;
    const milestoneName = `L3-ms-${Date.now()}`;

    await page.goto('/');
    await page.getByTestId(TID.bottomNavProjects).first().click();

    await page.getByTestId(TID.projectCreateButton).first().click();
    await page.getByTestId(TID.projectNameInput).fill(projectName);
    await page.getByTestId(TID.projectSaveButton).click();

    // Land inside project detail — milestone-add is only mounted there.
    await expect(page.getByTestId(TID.milestoneAddButton).first()).toBeVisible({ timeout: 60_000 }); // aligned to config expect.timeout

    await page.getByTestId(TID.milestoneAddButton).first().click();
    await page.getByTestId(TID.milestoneNameInput).fill(milestoneName);
    await page.getByTestId(TID.milestoneSaveButton).click();

    const row = page.getByTestId(TID.milestoneRow).filter({ hasText: milestoneName });
    await expect(row).toBeVisible({ timeout: 60_000 });
  });
});
