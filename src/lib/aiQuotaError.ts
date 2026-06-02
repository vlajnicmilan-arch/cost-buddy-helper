/**
 * Parse a 429 response from an AI edge function to distinguish between
 * daily quota exhaustion and a transient gateway rate limit.
 *
 * Backend contract (supabase/functions/_shared/aiQuota.ts):
 *  - Daily cap → 429 with body { error: "daily_ai_limit_reached", route, limit, tier }
 *  - Gateway burst → 429 with a different body (or unparseable)
 *
 * Accepts anything with a numeric `status` and a `json()` method so it can
 * be reused with both `fetch` Responses and custom HTTP wrappers
 * (e.g. CapacitorHttp results).
 */
export type AiQuotaError =
  | { kind: "daily_limit"; limit: number; tier: string; route?: string }
  | { kind: "core_scan_limit"; resetAt: string | null }
  | { kind: "rate_limit" };

export interface QuotaResponseLike {
  status: number;
  json: () => Promise<any>;
}

export async function parseAiQuotaError(
  response: QuotaResponseLike,
): Promise<AiQuotaError | null> {
  if (response.status !== 429) return null;

  try {
    const body = await response.json();
    if (body && body.error === "daily_ai_limit_reached") {
      return {
        kind: "daily_limit",
        limit: typeof body.limit === "number" ? body.limit : 0,
        tier: typeof body.tier === "string" ? body.tier : "free",
        route: typeof body.route === "string" ? body.route : undefined,
      };
    }
    if (body && body.error === "core_scan_limit_reached") {
      return {
        kind: "core_scan_limit",
        resetAt: typeof body.reset_at === "string" ? body.reset_at : null,
      };
    }
  } catch {
    // body wasn't JSON — treat as plain rate limit
  }

  return { kind: "rate_limit" };
}

/**
 * Emits a window event that the global ScanQuotaReachedDialog listens for.
 * Safe to call from anywhere (no-op in non-browser environments).
 */
export function emitCoreScanLimitReached(resetAt: string | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("core-scan-limit-reached", { detail: { resetAt } }),
  );
}
