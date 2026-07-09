// notify-krug-event — Krug Notifications MVP writer.
//
// Server-side canonical fan-out for MVP Krug events:
//   - krug_member_added
//   - krug_expense_proposed
//   - krug_expense_confirmed
//   - krug_expense_rejected
//   - krug_deletion_requested
//   - krug_deleted
//
// Recipients:
//   - `recipient_override` (uuid[]) is used verbatim when present. It is the
//     only reliable source for `krug_member_added` (single new member) and
//     `krug_deleted` (snapshot passed from RPC before the krug row is purged).
//   - Otherwise the resolver reads recipients from krug_membership UNION
//     krug_ownership so the owner is always included even if their
//     `punopravni` membership row is somehow missing. Actor is always excluded.
//
// Dedup:
//   - Each event carries a stable `dedup_ref` (see comments per event source).
//   - Before inserting an in-app row we probe `notifications` for an existing
//     row with the same (user_id, type, data->>'dedup_ref').
//
// Preference gate:
//   - Both the in-app write and the push call are gated by
//     `is_push_category_enabled(user_id, 'krug')`. The push side also runs the
//     same check as a defense-in-depth pass.
//
// verify_jwt = false: called only from trusted server-side sources
// (edge fn `krug-add-member`, RPC-backed `net.http_post`). Uses service role
// key internally and RLS is bypassed for reads/writes it performs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType =
  | "krug_member_added"
  | "krug_expense_proposed"
  | "krug_expense_confirmed"
  | "krug_expense_rejected"
  | "krug_deletion_requested"
  | "krug_deleted";

interface Payload {
  event_type: EventType;
  krug_id: string;
  actor_id: string;
  expense_id?: string | null;
  deletion_request_id?: string | null;
  dedup_ref: string;
  recipient_override?: string[] | null;
}

const VALID: readonly EventType[] = [
  "krug_member_added",
  "krug_expense_proposed",
  "krug_expense_confirmed",
  "krug_expense_rejected",
  "krug_deletion_requested",
  "krug_deleted",
];

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time string compare to avoid timing side-channels on the shared
// secret used for internal auth.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ---- Internal-auth guard ----
  // notify-krug-event is a privileged writer (service_role client, push
  // dispatch, recipient_override). It must not be publicly callable. All
  // legitimate callers (RPC via net.http_post using the vault-stored service
  // role key, `krug-add-member` edge fn via functions.invoke with the admin
  // client) present the service_role key as their Bearer token. Anything else
  // is rejected 401 before any work is done.
  const authHeader = req.headers.get("Authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  if (!SERVICE_KEY || !presented || !timingSafeEqual(presented, SERVICE_KEY)) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);


  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const {
    event_type,
    krug_id,
    actor_id,
    expense_id = null,
    deletion_request_id = null,
    dedup_ref,
    recipient_override = null,
  } = payload ?? {};

  if (!VALID.includes(event_type)) return json({ error: "invalid_event_type" }, 400);
  if (!isUuid(krug_id)) return json({ error: "invalid_krug_id" }, 400);
  if (!isUuid(actor_id)) return json({ error: "invalid_actor_id" }, 400);
  if (typeof dedup_ref !== "string" || dedup_ref.length === 0) {
    return json({ error: "invalid_dedup_ref" }, 400);
  }

  // -------- Resolve recipients --------
  const recipients = new Set<string>();
  if (Array.isArray(recipient_override) && recipient_override.length > 0) {
    for (const r of recipient_override) if (isUuid(r)) recipients.add(r);
  } else {
    const useFull =
      event_type === "krug_expense_proposed"; // full = punopravni + owner
    const roleFilter = useFull ? "punopravni" : null;

    // Owner is ALWAYS included via krug_ownership regardless of membership row.
    const [{ data: owners }, { data: members }] = await Promise.all([
      admin.from("krug_ownership").select("user_id").eq("krug_id", krug_id),
      roleFilter
        ? admin.from("krug_membership").select("user_id").eq("krug_id", krug_id).eq("role", roleFilter)
        : admin.from("krug_membership").select("user_id").eq("krug_id", krug_id),
    ]);
    for (const r of owners ?? []) if (isUuid(r.user_id)) recipients.add(r.user_id);
    for (const r of members ?? []) if (isUuid(r.user_id)) recipients.add(r.user_id);
  }

  // Actor exclusion is event-aware, not blanket.
  // - member_added: subject is a fresh recipient; actor exclusion is a no-op.
  // - expense_proposed: authored by actor, so actor must not receive.
  // - expense_confirmed / expense_rejected: caller already scopes
  //   recipient_override to [author]; exclusion would still be a safe no-op,
  //   but we apply it to defend the resolver path.
  // - deletion_requested: initiator should NOT be notified back.
  // - deleted: fan-out MUST go to every snapshot member, including the
  //   initiator. Do NOT drop actor here — the canonical plan requires the
  //   initiator to receive the terminal "deleted" event.
  if (event_type !== "krug_deleted") {
    recipients.delete(actor_id);
  }


  if (recipients.size === 0) {
    return json({ ok: true, delivered: 0, reason: "no_recipients" });
  }

  // -------- Message + payload shape --------
  const titleKey = `notifications.krug.${event_type_shortKey(event_type)}.title`;
  const bodyKey = `notifications.krug.${event_type_shortKey(event_type)}.message`;
  const highlightRoute = `/krug`; // MVP: land on krug list; deleted route ok
  const route = event_type === "krug_deleted" ? "/krug" : `/krug`;

  const dataCore: Record<string, unknown> = {
    krug_id,
    actor_id,
    expense_id,
    deletion_request_id,
    dedup_ref,
    category: "krug",
    route,
    fallback_route: highlightRoute,
    i18n_title_key: titleKey,
    i18n_body_key: bodyKey,
    title_vars: {},
    message_vars: {},
  };

  let delivered = 0;
  const errors: string[] = [];

  for (const userId of recipients) {
    try {
      // Preference gate — silence both in-app + push when krug is disabled.
      const { data: allowed } = await admin.rpc("is_push_category_enabled", {
        _user_id: userId,
        _category: "krug",
      });
      if (allowed === false) continue;

      // Dedup: skip if a notification with the same dedup_ref already exists.
      const { data: existing } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", event_type)
        .contains("data", { dedup_ref })
        .limit(1);
      if (existing && existing.length > 0) continue;

      const { error: insErr } = await admin.from("notifications").insert({
        user_id: userId,
        type: event_type,
        title: titleKey,
        message: bodyKey,
        data: dataCore,
      });
      if (insErr) {
        errors.push(`insert:${insErr.message}`);
        continue;
      }

      // Push (best effort; send-push runs its own preference check).
      try {
        await admin.functions.invoke("send-push", {
          body: {
            user_id: userId,
            title: titleKey,
            body: bodyKey,
            source: "notify-krug-event",
            data: dataCore,
          },
        });
      } catch (e) {
        errors.push(`push:${(e as Error).message}`);
      }
      delivered += 1;
    } catch (e) {
      errors.push(`unexpected:${(e as Error).message}`);
    }
  }

  return json({ ok: true, delivered, errors: errors.length ? errors : undefined });
});

function event_type_shortKey(t: EventType): string {
  switch (t) {
    case "krug_member_added":
      return "member_added";
    case "krug_expense_proposed":
      return "expense_proposed";
    case "krug_expense_confirmed":
      return "expense_confirmed";
    case "krug_expense_rejected":
      return "expense_rejected";
    case "krug_deletion_requested":
      return "deletion_requested";
    case "krug_deleted":
      return "deleted";
  }
}
