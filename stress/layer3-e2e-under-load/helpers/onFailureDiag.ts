import { test, type Page, type TestInfo } from '@playwright/test';
import { request as pwRequest } from '@playwright/test';
import { admin } from './db';
import { env } from './env';

/**
 * On-failure diagnostics — printed to STDOUT as ::error annotations.
 *
 * Beyond URL/body/auth dumps this also probes the two most common Layer 3
 * failure modes with authoritative data (not UI hypotheses):
 *
 *   1. S1 "row not visible" → query `expenses` via service role for the
 *      test marker. Row present ⇒ submit succeeded, list render/filter is
 *      the cosmetic culprit. Row absent ⇒ submit truly failed.
 *   2. S2 "paywall on /projects" → query `user_subscriptions` for the test
 *      user AND call `check-subscription` edge fn with that user's own
 *      token. Compares seeded tier vs what the SubscriptionContext actually
 *      resolves to at read time.
 *
 * Context (userId, marker) is passed via `testInfo.annotations` with types
 * `l3-user-id` and `l3-marker`. Tests set them at the top of the body.
 */
export function registerOnFailureDiagnostics(): void {
  // Capture console errors + pageerrors per-test into a stash on the page,
  // so afterEach can dump them. Cheap; only added once per beforeEach.
  test.beforeEach(async ({ page }) => {
    const stash: string[] = [];
    (page as unknown as { __l3ConsoleErrors?: string[] }).__l3ConsoleErrors = stash;
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        stash.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
      }
    });
    page.on('pageerror', (err) => {
      stash.push(`[pageerror] ${err.message.slice(0, 300)}`);
    });
  });

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
            out.cookie_consent_v2 = window.localStorage.getItem('cookie_consent_v2');
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

      // ---- Authoritative DB & subscription probes ----
      const userId = testInfo.annotations.find((a) => a.type === 'l3-user-id')?.description;
      const marker = testInfo.annotations.find((a) => a.type === 'l3-marker')?.description;
      const a = admin();

      // S1 probe: did the expense actually persist?
      if (marker) {
        try {
          const { data, error } = await a
            .from('expenses')
            .select('id, user_id, description, amount, payment_source, deleted_at, created_at')
            .eq('description', marker);
          if (error) {
            console.log(`::error title=L3 DB expenses probe error [${testInfo.title}]::${error.message}`);
          } else {
            console.log(
              `::error title=L3 DB expenses probe [${testInfo.title}]::marker=${marker} rows=${data?.length ?? 0} data=${JSON.stringify(data ?? []).slice(0, 800)}`,
            );
          }
        } catch (e) {
          console.log(`::warning title=L3 DB expenses probe threw::${(e as Error).message}`);
        }
      }

      // S2 probe: what does user_subscriptions hold + what does check-subscription return?
      if (userId) {
        try {
          const { data: sub, error } = await a
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
          console.log(
            `::error title=L3 DB user_subscriptions [${testInfo.title}]::user_id=${userId} err=${error?.message ?? 'null'} row=${JSON.stringify(sub ?? null)}`,
          );
        } catch (e) {
          console.log(`::warning title=L3 DB user_subscriptions threw::${(e as Error).message}`);
        }

        // Mint a fresh access token for the user via GoTrue admin generate_link, then
        // call check-subscription with it — mirrors exactly what SubscriptionContext does.
        try {
          const accessToken = await page
            .evaluate(() => {
              try {
                for (let i = 0; i < window.localStorage.length; i += 1) {
                  const k = window.localStorage.key(i);
                  if (k && /^sb-.*-auth-token$/.test(k)) {
                    const raw = window.localStorage.getItem(k);
                    if (!raw) return null;
                    const parsed = JSON.parse(raw);
                    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
                  }
                }
              } catch { /* noop */ }
              return null;
            })
            .catch(() => null as string | null);
          if (accessToken) {
            const req = await pwRequest.newContext();
            try {
              const res = await req.post(`${env.supabaseUrl}/functions/v1/check-subscription`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  apikey: env.supabaseAnonKey,
                  'Content-Type': 'application/json',
                },
                data: {},
              });
              const status = res.status();
              const bodyTxt = (await res.text()).slice(0, 600);
              console.log(
                `::error title=L3 check-subscription probe [${testInfo.title}]::status=${status} body=${bodyTxt}`,
              );
            } finally {
              await req.dispose();
            }
          } else {
            console.log(`::warning title=L3 check-subscription probe skipped::no access_token in LS`);
          }
        } catch (e) {
          console.log(`::warning title=L3 check-subscription probe threw::${(e as Error).message}`);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`::warning title=L3 diag helper failed::${(e as Error).message}`);
    }
  });
}
