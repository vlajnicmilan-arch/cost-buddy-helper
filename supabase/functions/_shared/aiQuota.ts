// Shared helpers for AI cost-abuse protection across edge functions.
//
// Two responsibilities:
//   1) requireAuth(req)      → verifies the JWT and returns { userId, supabase, authHeader }
//                              or a 401 Response if the caller is not authenticated.
//   2) checkAiQuota(...)     → atomically increments per-user/per-route daily counter
//                              and returns a 429 Response if the tier limit was exceeded.
//
// Tier resolution: reads `user_entitlements` via has_entitlement RPC.
// Free / Pro / Business limits are defined per route below — tune without redeploy
// by editing this file.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Tier = "free" | "trial" | "pro" | "business";

// Per-route daily limits. Trial = ograničena istraga (ne pune Pro kvote).
// Monthly kapica se primjenjuje samo na 'trial' — pro/business = neograničeno.
const QUOTAS: Record<string, Record<Tier, number>> = {
  "parse-receipt":         { free: 10, trial: 15, pro: 100, business: 500 },
  "parse-pdf-statement":   { free: 3,  trial: 5,  pro: 30,  business: 150 },
  "financial-assistant":   { free: 5,  trial: 15, pro: 50,  business: 200 },
  "generate-ai-insights":  { free: 2,  trial: 3,  pro: 5,   business: 10 },
  "scan-card":             { free: 5,  trial: 10, pro: 20,  business: 50 },
  "analyze-document":      { free: 5,  trial: 10, pro: 30,  business: 100 },
  "categorize-transaction":{ free: 30, trial: 20, pro: 200, business: 1000 },
  "detect-loans":          { free: 5,  trial: 10, pro: 30,  business: 100 },
  "match-recurring":       { free: 5,  trial: 10, pro: 30,  business: 100 },
  "parse-standup":         { free: 5,  trial: 10, pro: 30,  business: 100 },
};

// Mjesečni ukupni cap po korisniku (kroz sve rute). null = neograničeno.
// Milan (17.07.2026): trial = 150 poziva / 30 dana ukupno.
const MONTHLY_LIMITS: Record<Tier, number | null> = {
  free: null,
  trial: 150,
  pro: null,
  business: null,
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

/**
 * FAZA 5 — tier resolucija ide preko has_entitlement (jedini izvor istine).
 *   business = biznis modul aktivan (Komplet/business_legacy/admin biznis)
 *   pro      = smjer aktivan iz plaćenog/legacy/admin izvora
 *   trial    = smjer aktivan iz source='trial'
 *   free     = ništa aktivno
 */
async function resolveTier(supabase: SupabaseClient, userId: string): Promise<Tier> {
  try {
    const [{ data: hasBiznis }, { data: hasSmjer }] = await Promise.all([
      supabase.rpc("has_entitlement", { _user_id: userId, _module: "biznis" }),
      supabase.rpc("has_entitlement", { _user_id: userId, _module: "smjer" }),
    ]);

    if (hasBiznis === true) return "business";
    if (hasSmjer === true) {
      // razlikuj trial od plaćenog: pogledaj source aktivnog smjer retka.
      const { data: rows } = await supabase
        .from("user_entitlements")
        .select("source")
        .eq("user_id", userId)
        .eq("status", "active")
        .in("module", ["smjer", "pro_legacy", "business_legacy"]);
      const sources = (rows || []).map((r: any) => r.source);
      const paidLike = sources.some((s: string) =>
        s === "paddle" || s === "admin_grant" || s === "migration"
      );
      return paidLike ? "pro" : "trial";
    }
    return "free";
  } catch (e) {
    console.warn("[aiQuota] resolveTier failed, defaulting free:", (e as Error).message);
    return "free";
  }
}

/**
 * Atomically increments per-user counters (daily per-route + monthly total) and
 * returns a 429 Response if either the daily or the monthly cap was exceeded.
 * Returns null on success. Failures fail-open.
 */
export async function checkAiQuota(
  supabase: SupabaseClient,
  userId: string,
  route: string,
): Promise<Response | null> {
  const limits = QUOTAS[route];
  if (!limits) return null;

  const tier = await resolveTier(supabase, userId);
  const dailyLimit = limits[tier];
  const monthlyLimit = MONTHLY_LIMITS[tier];

  const { data, error } = await supabase.rpc("increment_ai_usage_v2", {
    p_route: route,
    p_daily_limit: dailyLimit,
    p_monthly_limit: monthlyLimit,
  });

  if (error) {
    console.warn("[aiQuota] increment_v2 failed, failing open:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    const reason = row.daily_allowed === false ? "daily_ai_limit_reached" : "monthly_ai_limit_reached";
    return new Response(
      JSON.stringify({
        error: reason,
        route,
        tier,
        daily_limit: dailyLimit,
        monthly_limit: monthlyLimit,
        daily_count: row.daily_count,
        monthly_count: row.monthly_count,
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
