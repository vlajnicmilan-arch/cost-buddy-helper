// Notify-family-event — sends opt-in pushes for family events:
//   - "override": split share for an expense was overridden (notifies expense owner)
//   - "reaction": someone added an emoji to a family transaction (notifies expense owner)
//   - "comment":  someone commented on a family transaction (notifies expense owner)
//
// Each recipient must have the corresponding notification_preferences flag enabled:
//   override  → family_override_push
//   reaction  → family_reactions_push
//   comment   → family_reactions_push
//
// 60-second per (expense, recipient, kind) throttle to avoid spam.
// Authenticated invocation (JWT verified by default).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { sendPushNotificationToMany } from "../_shared/sendPushNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventKind = "override" | "reaction" | "comment";

interface RequestBody {
  kind: EventKind;
  group_id: string;
  expense_id: string;
  preview?: string;
}

// In-memory throttle within a single function instance — best-effort.
const throttle = new Map<string, number>();
const THROTTLE_MS = 60_000;

function flagFor(kind: EventKind): "family_override_push" | "family_reactions_push" {
  return kind === "override" ? "family_override_push" : "family_reactions_push";
}

function titleFor(kind: EventKind): string {
  if (kind === "override") return "Promjena udjela u podjeli";
  if (kind === "reaction") return "Nova reakcija";
  return "Novi komentar";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await userClient.auth.getUser();
    const actorId = authData.user?.id;
    if (!actorId) {
      return new Response(JSON.stringify({ error: "no_user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.kind || !body?.expense_id || !body?.group_id) {
      return new Response(JSON.stringify({ error: "invalid_body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve expense owner
    const { data: expense } = await admin
      .from("expenses")
      .select("id, user_id, description, amount, currency")
      .eq("id", body.expense_id)
      .maybeSingle();
    if (!expense || expense.user_id === actorId) {
      return new Response(JSON.stringify({ ok: true, skipped: "self_or_missing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify owner is still a member of the group (defense in depth)
    const { data: member } = await admin
      .from("family_members")
      .select("user_id")
      .eq("group_id", body.group_id)
      .eq("user_id", expense.user_id)
      .maybeSingle();
    if (!member) {
      return new Response(JSON.stringify({ ok: true, skipped: "not_group_member" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Throttle (expense, recipient, kind)
    const key = `${body.expense_id}|${expense.user_id}|${body.kind}`;
    const now = Date.now();
    const last = throttle.get(key) || 0;
    if (now - last < THROTTLE_MS) {
      return new Response(JSON.stringify({ ok: true, throttled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    throttle.set(key, now);

    // Check notification preference
    const flag = flagFor(body.kind);
    const { data: prefs } = await admin
      .from("notification_preferences")
      .select(flag)
      .eq("user_id", expense.user_id)
      .maybeSingle();
    // @ts-ignore dynamic column
    const enabled = !!(prefs && prefs[flag]);
    if (!enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "opt_out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = titleFor(body.kind);
    const previewBody =
      body.preview?.slice(0, 120) ||
      (expense.description ? `${expense.description}` : "Transakcija");

    await sendPushNotificationToMany([expense.user_id], {
      title,
      body: previewBody,
      data: {
        type: `family_${body.kind}`,
        expense_id: body.expense_id,
        group_id: body.group_id,
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-family-event]", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
