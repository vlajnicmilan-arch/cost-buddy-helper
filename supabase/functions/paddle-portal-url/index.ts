/**
 * paddle-portal-url — returns a short-lived Paddle customer-portal URL.
 *
 * Auth: JWT required (verify_jwt = true is the default under signing-keys).
 * We revalidate the JWT in code via getUser() and use the resolved user id
 * to look up the Paddle customer_id from user_entitlements.metadata
 * (no schema change — cf. Milanova odluka).
 *
 * If the user has no paddle-source entitlement or the customer_id is missing,
 * we return { error: 'no_subscription' } so the client can hide the button.
 * If PADDLE_API_KEY is missing/invalid we return { error: 'portal_unavailable' }
 * and log the reason server-side (never leak the key).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RAW_PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY");
const PADDLE_API_KEY = RAW_PADDLE_API_KEY?.trim();
const FORCED_ENV = (Deno.env.get("PADDLE_ENV") ?? "").toLowerCase();

function log(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: "paddle-portal-url", event, ...details }));
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function resolvePaddleBase(): string {
  if (FORCED_ENV === "sandbox") return "https://sandbox-api.paddle.com";
  if (FORCED_ENV === "production" || FORCED_ENV === "live") return "https://api.paddle.com";
  if (PADDLE_API_KEY?.includes("sdbx")) return "https://sandbox-api.paddle.com";
  return "https://api.paddle.com";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "unauthorized" });
  }

  // Resolve the caller via the anon client so RLS/JWT is honored.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return json(401, { error: "unauthorized" });
  }
  const userId = userRes.user.id;

  // Service client for reading entitlements (bypasses RLS quirks).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: entErr } = await admin
    .from("user_entitlements")
    .select("metadata, provider_sub_id, status, period_end")
    .eq("user_id", userId)
    .eq("source", "paddle");

  if (entErr) {
    log("entitlement_query_error", { error: entErr.message });
    return json(500, { error: "internal_error" });
  }

  const customerId = (rows ?? [])
    .map((r: { metadata: Record<string, unknown> | null }) =>
      (r.metadata as { customer_id?: string } | null)?.customer_id ?? null,
    )
    .find((v): v is string => typeof v === "string" && v.length > 0);

  if (!customerId) {
    return json(404, { error: "no_subscription" });
  }

  if (!PADDLE_API_KEY) {
    log("missing_api_key");
    return json(503, { error: "portal_unavailable" });
  }

  const base = resolvePaddleBase();
  const subIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r: { provider_sub_id: string | null }) => r.provider_sub_id)
        .filter((v): v is string => !!v),
    ),
  );

  const body: Record<string, unknown> = {};
  if (subIds.length > 0) body.subscription_ids = subIds;

  let apiRes: Response;
  try {
    apiRes = await fetch(`${base}/customers/${customerId}/portal-sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    log("paddle_fetch_error", { error: String(e) });
    return json(502, { error: "portal_unavailable" });
  }

  if (!apiRes.ok) {
    const text = await apiRes.text().catch(() => "");
    log("paddle_api_error", { status: apiRes.status, body: text.slice(0, 400) });
    return json(502, { error: "portal_unavailable" });
  }

  const payload = (await apiRes.json().catch(() => null)) as
    | {
        data?: {
          urls?: {
            general?: { overview?: string };
            subscriptions?: Array<{ id?: string; cancel_subscription?: string; update_subscription_payment_method?: string }>;
          };
        };
      }
    | null;

  const overview = payload?.data?.urls?.general?.overview ?? null;
  if (!overview) {
    log("no_overview_url", {});
    return json(502, { error: "portal_unavailable" });
  }

  return json(200, {
    url: overview,
    subscriptions: payload?.data?.urls?.subscriptions ?? [],
  });
});
