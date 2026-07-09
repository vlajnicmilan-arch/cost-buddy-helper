// Krug add-member edge function.
//
// Owner-only invitation of an existing user by email into a Krug.
// Honest-skeleton scope:
//   - lookup uses find_user_by_email (service role)
//   - membership insert respects RLS (owner via krug_membership_insert_owner)
//   - new users are NOT supported in v1 (returns user_not_found)
//   - returns HTTP 200 with outcome strings (client reads data.error)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AddRole = "punopravni" | "obicni";

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const krugId: string | undefined = body?.krug_id;
    const email: string | undefined = body?.email;
    const role: AddRole = body?.role === "punopravni" ? "punopravni" : "obicni";

    if (!krugId || !isEmail(email)) {
      return json({ error: "invalid_input" }, 200);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Owner check (defense-in-depth; RLS also enforces it on insert).
    const { data: ownership, error: ownErr } = await admin
      .from("krug_ownership")
      .select("user_id")
      .eq("krug_id", krugId)
      .maybeSingle();
    if (ownErr) {
      console.error("[KRUG-ADD-MEMBER] ownership error", ownErr);
      return json({ error: "lookup_failed" }, 200);
    }
    if (!ownership || ownership.user_id !== user.id) {
      return json({ error: "not_owner" }, 200);
    }

    // Lookup invited user.
    const { data: invitedUserId, error: lookupErr } = await admin.rpc(
      "find_user_by_email",
      { p_email: email!.trim().toLowerCase() },
    );
    if (lookupErr) {
      console.error("[KRUG-ADD-MEMBER] find_user_by_email error", lookupErr);
      return json({ error: "lookup_failed" }, 200);
    }
    if (!invitedUserId) {
      return json({ error: "user_not_found" }, 200);
    }
    if (invitedUserId === user.id) {
      return json({ error: "cannot_add_self" }, 200);
    }

    // Check existing membership.
    const { data: existing, error: existErr } = await admin
      .from("krug_membership")
      .select("id, role")
      .eq("krug_id", krugId)
      .eq("user_id", invitedUserId)
      .maybeSingle();
    if (existErr) {
      console.error("[KRUG-ADD-MEMBER] membership lookup error", existErr);
      return json({ error: "lookup_failed" }, 200);
    }
    if (existing) {
      return json({ error: "already_member" }, 200);
    }

    // Insert membership (RLS-equivalent via service role; we already verified owner).
    // BEFORE INSERT trigger `krug_enforce_punopravni_cap` may reject when the
    // preset's cap is exceeded — surface that as `cap_exceeded`.
    const { error: insErr } = await admin.from("krug_membership").insert({
      krug_id: krugId,
      user_id: invitedUserId,
      role,
      added_by: user.id,
    });
    if (insErr) {
      console.error("[KRUG-ADD-MEMBER] insert error", insErr);
      if ((insErr.message || "").includes("krug_punopravni_cap")) {
        return json({ error: "cap_exceeded" }, 200);
      }
      return json({ error: "insert_failed", detail: insErr.message }, 200);
    }

    // Fire-and-forget notification fan-out. Failure here MUST NOT roll back
    // the membership insert — logged and swallowed.
    try {
      await admin.functions.invoke("notify-krug-event", {
        body: {
          event_type: "krug_member_added",
          krug_id: krugId,
          actor_id: user.id,
          dedup_ref: `krug_member_added:${krugId}:${invitedUserId}`,
          recipient_override: [invitedUserId],
        },
      });
    } catch (e) {
      console.error("[KRUG-ADD-MEMBER] notify dispatch failed", e);
    }

    return json({ ok: true, user_id: invitedUserId, role }, 200);
  } catch (e) {
    console.error("[KRUG-ADD-MEMBER] unexpected", e);
    return json({ error: "unexpected" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
