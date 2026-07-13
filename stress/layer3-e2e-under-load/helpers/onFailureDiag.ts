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
      // Auth dump: which localStorage keys are present, does the sb-*-auth-token
      // key exist, and did the app expose any auth-ready flag on window.
      const authDump = await page
        .evaluate(() => {
          const out: Record<string, unknown> = {};
          try {
            const keys: string[] = [];
            for (let i = 0; i < window.localStorage.length; i += 1) {
              const k = window.localStorage.key(i);
              if (k) keys.push(k);
            }
            out.ls_keys = keys;
            out.ls_auth_keys = keys.filter((k) => /auth|^sb-/i.test(k));
            const sbKey = keys.find((k) => /^sb-.*-auth-token$/.test(k));
            if (sbKey) {
              const raw = window.localStorage.getItem(sbKey);
              try {
                const parsed = raw ? JSON.parse(raw) : null;
                out.sb_key = sbKey;
                out.sb_has_access_token = !!(parsed && (parsed.access_token || parsed.currentSession?.access_token));
                out.sb_expires_at = parsed?.expires_at ?? parsed?.currentSession?.expires_at ?? null;
              } catch {
                out.sb_key = sbKey;
                out.sb_parse_error = true;
              }
            } else {
              out.sb_key = null;
            }
            out.storage_config = window.localStorage.getItem('finmate-storage-config');
            out.onboarding_completed = window.localStorage.getItem('onboarding_completed');
            out.projects_module_enabled = window.localStorage.getItem('projects_module_enabled');
          } catch (e) {
            out.err = (e as Error).message;
          }
          return out;
        })
        .catch((e: Error) => ({ dump_error: e.message }));
      // eslint-disable-next-line no-console
      console.log(`::error title=L3 PW FAIL diag [${testInfo.title}]::url=${url} markers=${markers}`);
      // eslint-disable-next-line no-console
      console.log(`::error title=L3 PW FAIL auth [${testInfo.title}]::${JSON.stringify(authDump)}`);
      // eslint-disable-next-line no-console
      console.log(`::error title=L3 PW FAIL body [${testInfo.title}]::${trimmed.slice(0, 900)}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`::warning title=L3 diag helper failed::${(e as Error).message}`);
    }
  });
}
