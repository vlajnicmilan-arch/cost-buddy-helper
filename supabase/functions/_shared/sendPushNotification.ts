// Shared helper to dispatch a push notification via the `send-push` edge function.
// Push delivery is "best-effort" — failures must NEVER break in-app notification flows.
// This helper writes early lifecycle logs (helper stage) so we can see WHY a push
// never reached send-push (network errors, timeouts, etc.).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

interface SendPushArgs {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Name of the calling edge function — used for delivery log tracking */
  source?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Lazily-instantiated service-role client (single per cold start)
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

interface HelperLogEntry {
  user_id: string | null;
  source_function: string | null;
  title: string | null;
  body: string | null;
  request_id: string;
  dispatch_status:
    | "dispatch_started"
    | "dispatch_ok"
    | "dispatch_http_error"
    | "dispatch_network_error"
    | "dispatch_skipped";
  dispatch_error?: string | null;
  send_push_http_status?: number | null;
  request_payload?: any;
  response_summary?: any;
  duration_ms?: number;
}

async function writeHelperLog(entry: HelperLogEntry): Promise<void> {
  try {
    await getSupabase().from("push_delivery_logs").insert({
      user_id: entry.user_id,
      source_function: entry.source_function,
      title: entry.title,
      body: entry.body,
      token_count: 0,
      success_count: 0,
      failure_count: 0,
      fcm_error_codes: null,
      request_payload: entry.request_payload ?? {
        title: entry.title,
        body: entry.body,
      },
      response_summary: entry.response_summary ?? null,
      duration_ms: entry.duration_ms ?? 0,
      request_id: entry.request_id,
      dispatch_status: entry.dispatch_status,
      dispatch_error: entry.dispatch_error ?? null,
      send_push_http_status: entry.send_push_http_status ?? null,
      lifecycle_stage: "helper",
    });
  } catch (e) {
    console.warn("[sendPushNotification] Failed to write helper log:", e);
  }
}

export async function sendPushNotification(args: SendPushArgs): Promise<void> {
  const request_id = crypto.randomUUID();
  const source = args.source ?? "unknown";
  const startedAt = Date.now();

  if (!args.user_id || !args.title || !args.body) {
    console.warn("[sendPushNotification] Missing required fields, skipping");
    await writeHelperLog({
      user_id: args.user_id ?? null,
      source_function: source,
      title: args.title ?? null,
      body: args.body ?? null,
      request_id,
      dispatch_status: "dispatch_skipped",
      dispatch_error: "missing required fields (user_id/title/body)",
      duration_ms: Date.now() - startedAt,
    });
    return;
  }

  // 1) Log the dispatch attempt BEFORE the network call so we always have a trace.
  await writeHelperLog({
    user_id: args.user_id,
    source_function: source,
    title: args.title,
    body: args.body,
    request_id,
    dispatch_status: "dispatch_started",
    request_payload: { title: args.title, body: args.body, data: args.data ?? {} },
  });

  // 2) Attempt the call to send-push.
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: args.user_id,
        title: args.title,
        body: args.body,
        data: args.data ?? {},
        source,
        request_id,
      }),
    });

    let responseSummary: any = null;
    try {
      responseSummary = await resp.json();
    } catch {
      try {
        responseSummary = { text: await resp.text() };
      } catch {
        responseSummary = null;
      }
    }

    if (!resp.ok) {
      console.warn(
        `[sendPushNotification] send-push returned ${resp.status} for user ${args.user_id}`
      );
      await writeHelperLog({
        user_id: args.user_id,
        source_function: source,
        title: args.title,
        body: args.body,
        request_id,
        dispatch_status: "dispatch_http_error",
        dispatch_error: `send-push returned HTTP ${resp.status}`,
        send_push_http_status: resp.status,
        response_summary: responseSummary,
        duration_ms: Date.now() - startedAt,
      });
      return;
    }

    await writeHelperLog({
      user_id: args.user_id,
      source_function: source,
      title: args.title,
      body: args.body,
      request_id,
      dispatch_status: "dispatch_ok",
      send_push_http_status: resp.status,
      response_summary: responseSummary,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.warn(
      `[sendPushNotification] Failed to dispatch push for user ${args.user_id}:`,
      err
    );
    await writeHelperLog({
      user_id: args.user_id,
      source_function: source,
      title: args.title,
      body: args.body,
      request_id,
      dispatch_status: "dispatch_network_error",
      dispatch_error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - startedAt,
    });
  }
}

// Helper for fanning out to multiple recipients
export async function sendPushNotificationToMany(
  user_ids: string[],
  payload: Omit<SendPushArgs, "user_id">
): Promise<void> {
  await Promise.all(
    user_ids.map((user_id) =>
      sendPushNotification({ user_id, ...payload })
    )
  );
}
