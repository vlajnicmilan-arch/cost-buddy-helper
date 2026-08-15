/**
 * Bundle freshness — silent self-refresh of the web bundle.
 *
 * The running tab pins the JS bundle from the moment it loaded. After a new
 * publish, an open app keeps executing stale code until the user manually
 * kills it. This module compares the SHA baked into the running bundle
 * (`COMMIT_SHA` from `src/lib/version.ts`) with the SHA of the live
 * `index.html` (`<meta name="build-sha">`, injected by the Vite plugin) and
 * decides whether the tab may silently reload.
 *
 * Hard product rule (Milan): NEVER show any UI about versions — no toast,
 * no banner, no dialog. The refresh is either silent or postponed.
 *
 * Native APK updates (`useAppUpdateChecker` / version.json) are a separate
 * layer and are NOT touched here.
 */

export const BUILD_SHA_META_NAME = 'build-sha';

/** Minimum spacing between two live checks. */
export const BUNDLE_CHECK_DEBOUNCE_MS = 5 * 60 * 1000;
/** Periodic poll while the tab stays open. */
export const BUNDLE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Live fetch timeout — on timeout we do nothing (fail-safe). */
export const BUNDLE_FETCH_TIMEOUT_MS = 8000;

export type BundleAction = 'none' | 'reload' | 'defer';

/** Parses `<meta name="build-sha" content="...">` out of an index.html body. */
export const parseBuildSha = (html: string): string | null => {
  if (!html) return null;
  const match =
    html.match(/<meta[^>]+name=["']build-sha["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']build-sha["']/i);
  return match?.[1]?.trim() || null;
};

interface FetchLiveShaOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/**
 * Fetches the live `index.html` with cache busting, so a stale SW/HTTP cache
 * can never hand us the old marker. Returns `null` on any failure (fail-safe).
 */
export const fetchLiveBuildSha = async (
  opts: FetchLiveShaOptions = {},
): Promise<string | null> => {
  const doFetch = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return null;

  const nowFn = opts.now ?? Date.now;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    controller && typeof setTimeout !== 'undefined'
      ? setTimeout(() => controller.abort(), opts.timeoutMs ?? BUNDLE_FETCH_TIMEOUT_MS)
      : null;

  try {
    const res = await doFetch(`/index.html?bundle-check=${nowFn()}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      signal: controller?.signal,
    });
    if (!res?.ok) return null;
    const html = await res.text();
    return parseBuildSha(html);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export interface BundleDecisionInput {
  /** SHA baked into the running bundle. */
  localSha: string;
  /** SHA read from the live index.html; `null` when the check failed. */
  liveSha: string | null;
  /** True while critical user work is open (draft, unsaved dialog, running job). */
  isBusy: boolean;
  /** True when the tab is hidden — the calmest possible moment. */
  documentHidden: boolean;
}

/**
 * Pure decision:
 * - equal / unknown SHA  → 'none'  (also the anti-loop guard after a reload)
 * - different + calm     → 'reload'
 * - different + busy     → 'defer' (silently, no UI)
 * A hidden tab counts as calm by explicit product decision.
 */
export const decideBundleAction = ({
  localSha,
  liveSha,
  isBusy,
  documentHidden,
}: BundleDecisionInput): BundleAction => {
  if (!liveSha || !localSha) return 'none';
  if (liveSha === localSha) return 'none';
  if (isBusy) return 'defer';
  if (documentHidden) return 'reload';
  return 'reload';
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const IMPORT_PAYLOAD_KEY = 'vmb-import-review-payload:v1';
const IMPORT_DRAFT_KEY = 'vmb-import-review-draft:v1';

/** Critical-work signal: an import review payload/draft is parked in the session. */
export const hasImportReviewWork = (storage?: StorageLike | null): boolean => {
  const s =
    storage ??
    (typeof window !== 'undefined' ? (() => { try { return window.sessionStorage; } catch { return null; } })() : null);
  if (!s) return false;
  try {
    return !!(s.getItem(IMPORT_PAYLOAD_KEY) || s.getItem(IMPORT_DRAFT_KEY));
  } catch {
    return false;
  }
};

/** Critical-work signal: any shadcn dialog/sheet/alert is open in the DOM. */
export const hasOpenModal = (doc?: Document | null): boolean => {
  const d = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!d) return false;
  try {
    return !!d.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  } catch {
    return false;
  }
};
