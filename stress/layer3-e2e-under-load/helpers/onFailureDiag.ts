import { test, type Page, type TestInfo } from '@playwright/test';

/**
 * On-failure diagnostics — printed to STDOUT (not just artefact).
 *
 * Rationale: when Playwright inside `run-all.sh --layer=3` fails, humans
 * only see the wrapper's tail. Screenshots live inside a 15MB artefact zip
 * that requires a separate download step, so debugging cycles balloon.
 * This hook prints the concrete "where did the robot get stuck?" facts
 * (page URL, first ~30 lines of visible body text, whether obvious login
 * or onboarding markers are present) directly into the run log via
 * `::error` GitHub workflow commands. Judge runs then self-narrate.
 */
export function registerOnFailureDiagnostics(): void {
  test.afterEach(async ({ page }, testInfo: TestInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    try {
      const url = page.url();
      const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
      const trimmed = bodyText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .slice(0, 30)
        .join(' | ');
      const [hasEmailInput, hasPasswordInput, hasOnboardingMarker, hasSetupMarker] = await Promise.all([
        page.locator('input[type="email"]').count().catch(() => 0),
        page.locator('input[type="password"]').count().catch(() => 0),
        page.locator('[data-testid*="onboarding"], [data-onboarding]').count().catch(() => 0),
        page.locator('[data-testid*="storage-setup"], [data-testid*="setup"]').count().catch(() => 0),
      ]);
      const markers = [
        `login=${hasEmailInput > 0 || hasPasswordInput > 0}`,
        `onboarding=${hasOnboardingMarker > 0}`,
        `setup=${hasSetupMarker > 0}`,
      ].join(' ');
      // eslint-disable-next-line no-console
      console.log(`::error title=L3 PW FAIL diag [${testInfo.title}]::url=${url} markers=${markers}`);
      // eslint-disable-next-line no-console
      console.log(`::error title=L3 PW FAIL body [${testInfo.title}]::${trimmed.slice(0, 900)}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`::warning title=L3 diag helper failed::${(e as Error).message}`);
    }
  });
}
