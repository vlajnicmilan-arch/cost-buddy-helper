// Shared helpers for AI cost-abuse protection across edge functions.
//
// Two responsibilities:
//   1) requireAuth(req)      → verifies the JWT and returns { userId, supabase, authHeader }
//                              or a 401 Response if the caller is not authenticated.
//   2) checkAiQuota(...)     → atomically increments per-user/per-route daily counter
//                              and returns a 429 Response if the tier limit was exceeded.
//
// Tier resolution: reads `subscribers` (Stripe-driven) and falls back to 'free'.
// Free / Pro / Business limits are defined per route below — tune without redeploy
// by editing this file.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Tier = "free" | "pro" | "business";

// Per-route daily limits. null = unlimited.
const QUOTAS: Record<string, Record<Tier, number>> = {
  "parse-receipt":         { free: 10, pro: 100, business: 500 },
  "parse-pdf-statement":   { free: 3,  pro: 30,  business: 150 },
  "financial-assistant":   { free: 5,  pro: 50,  business: 200 },
  "generate-ai-insights":  { free: 2,  pro: 5,   business: 10 },
  "scan-card":             { free: 5,  pro: 20,  business: 50 },
  "analyze-document":      { free: 5,  pro: 30,  business: 100 },
  "categorize-transaction":{ free: 30, pro: 200, business: 1000 },
  "detect-loans":          { free: 5,  pro: 30,  business: 100 },
  "match-recurring":       { free: 5,  pro: 30,  business: 100 },
  "parse-standup":         { free: 5,  pro: 30,  business: 100 },
};

export interface AuthResult {
  userId: string;
  supabase: SupabaseClient;
  authHeader: string;
}

/**
 * Verifies the caller's JWT via getClaims. Returns either an AuthResult or a
 * 401 Response that the caller should return as-is.
 */
export async function requireAuth(req: Request): Promise<AuthResult | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return { userId: data.claims.sub as string, supabase, authHeader };
}

async function resolveTier(supabase: SupabaseClient, userId: string): Promise<Tier> {
  try {
    // 1) Admin-assigned / Stripe-synced tier in user_subscriptions (source of truth — mirrors check-subscription)
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("tier, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (sub && sub.tier && sub.tier !== "free") {
      const notExpired = !sub.expires_at || new Date(sub.expires_at) > new Date();
      if (notExpired) {
        const t = String(sub.tier).toLowerCase();
        if (t.includes("business")) return "business";
        if (t.includes("pro") || t.includes("premium") || t.includes("lifetime")) return "pro";
      }
    }

    // 2) Lifetime Pro one-time purchase
    const { data: lifetime } = await supabase
      .from("lifetime_purchases")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (lifetime) return "pro";

    return "free";
  } catch {
    return "free";
  }
}

/**
 * Atomically increments the per-user daily counter for `route` and returns a
 * 429 Response if the tier's limit has been exceeded. Returns null on success.
 *
 * Uses SECURITY DEFINER RPC `increment_ai_usage`. Failures (e.g. transient DB
 * errors) fail-open so AI features keep working — the workspace budget cap is
 * the ultimate hard stop.
 */
export async function checkAiQuota(
  supabase: SupabaseClient,
  userId: string,
  route: string,
): Promise<Response | null> {
  const limits = QUOTAS[route];
  if (!limits) return null; // route not gated

  const tier = await resolveTier(supabase, userId);
  const limit = limits[tier];

  // Use service-role client so RLS / SECURITY DEFINER works with the real auth.uid().
  // We rely on auth.uid() inside the function — so reuse the user-scoped client.
  const { data, error } = await supabase.rpc("increment_ai_usage", {
    p_route: route,
    p_limit: limit,
  });

  if (error) {
    console.warn("[aiQuota] increment failed, failing open:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    return new Response(
      JSON.stringify({
        error: "daily_ai_limit_reached",
        route,
        limit,
        tier,
      }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return null;
}

// =========================================================
// Core scan quota (global 3 / 30 days, per user; unlimited for paid)
// =========================================================

const SKIP_HEADER = "x-internal-skip-quota";

/**
 * Returns true if the request carries a valid internal skip-quota header.
 * Used by self-fetching functions (e.g. parse-pdf-statement async branch) so
 * the inner call does not double-decrement quotas already consumed outside.
 */
export function isInternalSkipQuota(req: Request): boolean {
  const provided = req.headers.get(SKIP_HEADER);
  if (!provided) return false;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!secret && provided === secret;
}

export function internalSkipQuotaHeader(): Record<string, string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return { "X-Internal-Skip-Quota": secret };
}

export interface CoreScanQuotaResult {
  allowed: boolean;
  unlimited?: boolean;
  remaining?: number;
  count?: number;
  reset_at?: string;
}

/**
 * Consume one slot from the global Core scan quota.
 * Returns a 429 Response when the user hit the limit (free tier only).
 * Returns null on success or transient failures (fail-open).
 */
export async function consumeCoreScanQuota(
  supabase: SupabaseClient,
): Promise<Response | null> {
  const { data, error } = await supabase.rpc("consume_core_scan_quota");
  if (error) {
    console.warn("[coreScanQuota] consume failed, failing open:", error.message);
    return null;
  }
  const result = (data ?? {}) as CoreScanQuotaResult;
  if (result.allowed === false) {
    return new Response(
      JSON.stringify({
        error: "core_scan_limit_reached",
        remaining: 0,
        reset_at: result.reset_at,
      }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  return null;
}

/**
 * Refund one slot when the AI pipeline failed after consumption.
 * Best-effort; never throws.
 */
export async function refundCoreScanQuota(supabase: SupabaseClient): Promise<void> {
  try {
    const { error } = await supabase.rpc("refund_core_scan_quota");
    if (error) console.warn("[coreScanQuota] refund failed:", error.message);
  } catch (e) {
    console.warn("[coreScanQuota] refund threw:", (e as Error).message);
  }
}
