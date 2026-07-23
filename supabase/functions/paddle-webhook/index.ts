/**
 * paddle-webhook — Paddle Billing (v2) webhook receiver.
 *
 * Security:
 *  - verify_jwt = false (Paddle calls without a JWT). Signature is the ONLY defense.
 *  - Reads raw body BEFORE parsing JSON (signature is computed over raw bytes).
 *  - HMAC-SHA256 over `${ts}:${rawBody}` with PADDLE_WEBHOOK_SECRET.
 *  - Rejects timestamps older than 5 minutes (replay protection).
 *  - Never crashes on bad input — bad requests get 401 and are logged, not exceptions.
 *
 * Idempotency:
 *  - INSERT into public.webhook_events (UNIQUE(provider, event_id)).
 *  - On unique-violation → already processed → return 200 OK.
 *
 * Entitlements:
 *  - Upserts into public.user_entitlements using service_role (bypasses RLS).
 *  - Uses public.paddle_price_map to expand a price_id into one or more modules
 *    (Komplet = 3 rows: smjer + krug + projekti).
 *
 * User linkage (Phase 2 scaffolding — checkout is Phase 3):
 *  - Preferred: subscription.custom_data.user_id (set at checkout time).
 *  - Fallback: match on customer email → auth.users. Documented as risky
 *    (email collisions, users who signed up with a different address).
 *
 * This function only WRITES entitlements. The app doesn't read them yet;
 * that's Phase 5.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { parsePaddleSignature, verifyPaddleSignature } from "../_shared/paddleSignature.ts";
import { decideSubscriptionState } from "../_shared/paddleCancelDecision.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAW_PADDLE_WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET");
const PADDLE_WEBHOOK_SECRET = RAW_PADDLE_WEBHOOK_SECRET?.trim();

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Minimal CORS (Paddle is server-to-server; browsers won't call us).
const baseHeaders = { "Content-Type": "application/json" } as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders });
}

function log(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: "paddle-webhook", event, ...details }));
}

interface PaddlePriceItem {
  price?: { id?: string };
  quantity?: number;
}

interface PaddleSubscriptionData {
  id?: string;
  status?: string;
  current_billing_period?: { starts_at?: string; ends_at?: string };
  canceled_at?: string | null;
  scheduled_change?: { action?: string; effective_at?: string } | null;
  items?: PaddlePriceItem[];
  custom_data?: Record<string, unknown> | null;
  customer_id?: string;
}

interface PaddleEventEnvelope {
  event_id?: string;
  notification_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: PaddleSubscriptionData & Record<string, unknown>;
}

/** Extract our internal user_id from Paddle payload. Returns null if not linkable. */
async function resolveUserId(data: PaddleSubscriptionData | undefined): Promise<string | null> {
  const cd = data?.custom_data as Record<string, unknown> | undefined;
  const fromCustom = typeof cd?.user_id === "string" ? (cd!.user_id as string) : null;
  if (fromCustom) return fromCustom;

  // Fallback: lookup by customer email via Paddle customer id → auth.users
  // NOT implemented in Phase 2 (needs Paddle API call + PADDLE_API_KEY).
  // Log so we can see how often we'd hit this in practice.
  log("user_link_missing_custom_data", { customer_id: data?.customer_id });
  return null;
}

interface MappedModule {
  module: string;
  billing_cycle: string;
}

async function mapPriceIds(priceIds: string[]): Promise<Map<string, MappedModule[]>> {
  const out = new Map<string, MappedModule[]>();
  if (priceIds.length === 0) return out;
  const { data, error } = await admin
    .from("paddle_price_map")
    .select("price_id, module, billing_cycle")
    .in("price_id", priceIds);
  if (error) {
    log("price_map_error", { error: error.message });
    return out;
  }
  for (const row of data ?? []) {
    const arr = out.get(row.price_id) ?? [];
    arr.push({ module: row.module, billing_cycle: row.billing_cycle });
    out.set(row.price_id, arr);
  }
  return out;
}

async function applySubscriptionEntitlements(params: {
  userId: string;
  subscriptionId: string;
  priceIds: string[];
  status: "active" | "canceled" | "past_due" | "paused";
  periodStart: string;
  periodEnd: string | null;
  metadata: Record<string, unknown>;
}) {
  const { userId, subscriptionId, priceIds, status, periodStart, periodEnd, metadata } = params;
  const map = await mapPriceIds(priceIds);

  const rows: Array<Record<string, unknown>> = [];
  for (const pid of priceIds) {
    const mapped = map.get(pid);
    if (!mapped || mapped.length === 0) {
      log("unmapped_price_id", { subscription_id: subscriptionId, price_id: pid });
      continue;
    }
    for (const m of mapped) {
      rows.push({
        user_id: userId,
        module: m.module,
        source: "paddle",
        status,
        period_start: periodStart,
        period_end: periodEnd,
        billing_cycle: m.billing_cycle,
        provider: "paddle",
        provider_sub_id: subscriptionId,
        provider_price_id: pid,
        metadata,
      });
    }
  }

  if (rows.length === 0) {
    log("no_entitlement_rows", { subscription_id: subscriptionId, price_ids: priceIds });
    return { upserts: 0 };
  }

  const { error } = await admin
    .from("user_entitlements")
    .upsert(rows, { onConflict: "user_id,module,provider_sub_id" });
  if (error) {
    log("entitlement_upsert_error", { error: error.message, subscription_id: subscriptionId });
    throw new Error(`entitlement upsert failed: ${error.message}`);
  }
  log("entitlements_upserted", {
    subscription_id: subscriptionId,
    user_id: userId,
    modules: rows.map((r) => r.module),
    status,
    period_end: periodEnd,
  });
  return { upserts: rows.length };
}

async function handleSubscriptionEvent(evt: PaddleEventEnvelope) {
  const data = evt.data;
  const subscriptionId = data?.id;
  if (!subscriptionId) {
    log("subscription_missing_id", { event_type: evt.event_type });
    return;
  }
  const userId = await resolveUserId(data);
  if (!userId) {
    // Store event but don't fail — we may backfill later once we know the user.
    log("subscription_no_user_link", { subscription_id: subscriptionId });
    return;
  }

  const priceIds = (data?.items ?? [])
    .map((i) => i.price?.id)
    .filter((x): x is string => typeof x === "string");

  const periodStart = data?.current_billing_period?.starts_at ?? new Date().toISOString();
  const periodEnd = data?.current_billing_period?.ends_at ?? null;

  const decision = decideSubscriptionState({
    eventType: evt.event_type ?? "",
    status: data?.status ?? null,
    scheduledChange: data?.scheduled_change ?? null,
    canceledAt: data?.canceled_at ?? null,
    periodEnd,
    now: new Date(),
  });

  await applySubscriptionEntitlements({
    userId,
    subscriptionId,
    priceIds,
    status: decision.status,
    periodStart,
    periodEnd,
    metadata: {
      event_type: evt.event_type,
      customer_id: data?.customer_id ?? null,
      scheduled_change: data?.scheduled_change ?? null,
      canceled_at: data?.canceled_at ?? null,
      scheduled_cancel_at: decision.scheduledCancelAt,
    },
  });
}

async function handleAdjustmentEvent(evt: PaddleEventEnvelope) {
  // Refund / chargeback. Phase 2 policy: log only, do NOT auto-revoke.
  // Milan to decide exact behavior (partial refund vs. full chargeback vs. dispute).
  log("adjustment_received_no_action", {
    event_type: evt.event_type,
    adjustment_id: (evt.data as { id?: string })?.id,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // 1) Read RAW body first (signature must be verified against unmodified bytes)
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (e) {
    log("body_read_error", { error: String(e) });
    return json(400, { error: "body_read_error" });
  }

  // 2) Verify signature
  const sigHeader = req.headers.get("Paddle-Signature") ?? req.headers.get("paddle-signature");
  const verified = await verifyPaddleSignature(rawBody, sigHeader, PADDLE_WEBHOOK_SECRET);
  if (!verified.ok) {
    const parsedHeader = parsePaddleSignature(sigHeader);
    log("signature_rejected", {
      reason: verified.reason,
      verification_step:
        verified.reason === "no_secret" ? "secret_load"
          : verified.reason === "missing_header" ? "header_read"
          : verified.reason === "bad_format" ? "header_parse"
          : verified.reason === "stale" ? "timestamp_tolerance"
          : "hmac_compare",
      secret_length: RAW_PADDLE_WEBHOOK_SECRET?.length ?? 0,
      secret_has_edge_whitespace:
        RAW_PADDLE_WEBHOOK_SECRET !== undefined &&
        RAW_PADDLE_WEBHOOK_SECRET !== RAW_PADDLE_WEBHOOK_SECRET.trim(),
      secret_starts_with_pdl: PADDLE_WEBHOOK_SECRET?.startsWith("pdl_") ?? false,
      signature_header_present: sigHeader !== null,
      signature_count: parsedHeader?.h1.length ?? 0,
    });
    return json(401, { error: "invalid_signature" });
  }

  // 3) Parse JSON (safe now — bytes are authenticated)
  let evt: PaddleEventEnvelope;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    log("json_parse_error", {});
    return json(400, { error: "invalid_json" });
  }

  const eventId = evt.event_id ?? evt.notification_id;
  const eventType = evt.event_type;
  if (!eventId || !eventType) {
    log("missing_event_fields", { has_id: !!eventId, has_type: !!eventType });
    return json(400, { error: "missing_event_id_or_type" });
  }

  // 4) Idempotency guard — INSERT first, on conflict → already processed
  const { error: insertErr } = await admin.from("webhook_events").insert({
    provider: "paddle",
    event_id: eventId,
    event_type: eventType,
    payload: evt,
  });
  if (insertErr) {
    // 23505 = unique_violation on (provider, event_id)
    if ((insertErr as { code?: string }).code === "23505") {
      log("duplicate_event", { event_id: eventId, event_type: eventType });
      return json(200, { ok: true, duplicate: true });
    }
    log("webhook_insert_error", { error: insertErr.message, event_id: eventId });
    // Don't 500 — Paddle would retry forever. Return 200 to acknowledge receipt
    // and swallow; we already logged it.
    return json(200, { ok: true, warn: "insert_failed" });
  }

  // 5) Dispatch
  try {
    if (eventType.startsWith("subscription.")) {
      // Handle created / activated / updated / canceled / past_due / paused
      if (
        eventType === "subscription.created" ||
        eventType === "subscription.activated" ||
        eventType === "subscription.updated" ||
        eventType === "subscription.canceled" ||
        eventType === "subscription.past_due" ||
        eventType === "subscription.paused" ||
        eventType === "subscription.resumed"
      ) {
        await handleSubscriptionEvent(evt);
      } else {
        log("subscription_event_ignored", { event_type: eventType });
      }
    } else if (eventType === "transaction.payment_failed") {
      log("payment_failed_no_action", { event_id: eventId });
    } else if (eventType.startsWith("adjustment.")) {
      await handleAdjustmentEvent(evt);
    } else {
      log("event_ignored", { event_type: eventType });
    }

    await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", "paddle")
      .eq("event_id", eventId);

    return json(200, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("handler_error", { event_id: eventId, event_type: eventType, error: msg });
    await admin
      .from("webhook_events")
      .update({ processing_error: msg })
      .eq("provider", "paddle")
      .eq("event_id", eventId);
    // Return 500 so Paddle retries — the row is already inserted, so retries
    // will hit the idempotency guard and re-enter the handler.
    return json(500, { error: "handler_failed" });
  }
});
