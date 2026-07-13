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
  test.beforeEach(async ({ page }, testInfo) => {
    const userId = await resetUserByKey('primary');
    testInfo.annotations.push({ type: 'l3-user-id', description: userId });
    await signInFresh(page, 'primary');
  });

  test('create project → add milestone → milestone row visible', async ({ page }, testInfo) => {
    const projectName = `L3-proj-${Date.now()}`;
    const milestoneName = `L3-ms-${Date.now()}`;
    testInfo.annotations.push({ type: 'l3-marker', description: projectName });

    await page.goto('/');
    await page.getByTestId(TID.bottomNavProjects).first().click();

    await page.getByTestId(TID.projectCreateButton).first().click();
    await page.getByTestId(TID.projectNameInput).fill(projectName);
    await page.getByTestId(TID.projectSaveButton).click();

    // ProjectDialog.handleSubmit closes the dialog but does NOT auto-navigate
    // to project detail (verified in src/components/projects/ProjectDialog.tsx:220).
    // Mirror what a real user does: click the newly created project card to
    // open detail. ProjectCard renders <h3>{project.name}</h3>, so match by
    // heading role scoped to the fresh project name.
    await page.getByRole('heading', { name: projectName }).first().click();

    // Land inside project detail — milestone-add is only mounted there.
    await expect(page.getByTestId(TID.milestoneAddButton).first()).toBeVisible({ timeout: 60_000 }); // aligned to config expect.timeout

    await page.getByTestId(TID.milestoneAddButton).first().click();
    await page.getByTestId(TID.milestoneNameInput).fill(milestoneName);
    await page.getByTestId(TID.milestoneSaveButton).click();

    const row = page.getByTestId(TID.milestoneRow).filter({ hasText: milestoneName });
    await expect(row).toBeVisible({ timeout: 60_000 });
  });
});
