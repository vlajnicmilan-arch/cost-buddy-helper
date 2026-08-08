// Krug invite edge function (ex "add member").
//
// Consent model: the owner NEVER creates a membership row. This function only
// writes a PENDING invitation into `krug_invitations`. Membership is created
// exclusively by `krug_accept_invitation` (SECURITY DEFINER RPC) which the
// invitee alone can call. The DB enforces this: `krug_membership` has no
// client INSERT policy and the `krug_require_consent` trigger rejects any row
// without an accepted invitation (creator bootstrap excepted).
//
// New (unregistered) users are NOT supported — same behaviour as
// `send-member-invitation` for payment sources: returns `user_not_found`.
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
      // Nikad ne logiramo token — samo činjenicu da poziv nije autentificiran.
      console.warn("[KRUG-ADD-MEMBER] unauthorized: missing Authorization header");
      return json({ error: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      // Istekla/nevažeća sesija. Bez ovog traga 401 grana je bila nevidljiva u
      // logovima (incident 08.08.2026: „Greška pri dodavanju člana." bez ijednog
      // zapisa). Logiramo samo kod greške, nikad token.
      console.warn("[KRUG-ADD-MEMBER] unauthorized: session invalid or expired", {
        code: userErr?.status ?? null,
        message: userErr?.message ?? "no user in session",
      });
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const krugId: string | undefined = body?.krug_id;
    const email: string | undefined = body?.email;
    const role: AddRole = body?.role === "punopravni" ? "punopravni" : "obicni";

    if (!krugId || !isEmail(email)) {
      return json({ error: "invalid_input" }, 200);
    }
    const normalizedEmail = email!.trim().toLowerCase();

    const admin = createClient(supabaseUrl, serviceKey);

    // Owner check (defense-in-depth; RLS also enforces it on the invitation insert).
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
      { p_email: normalizedEmail },
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

    // Already a member?
    const { data: existing, error: existErr } = await admin
      .from("krug_membership")
      .select("id")
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

    // Already invited? One active pending per (krug, email) — DB has a partial
    // unique index; this check only produces the nicer error string.
    const { data: pending, error: pendErr } = await admin
      .from("krug_invitations")
      .select("id")
      .eq("krug_id", krugId)
      .eq("status", "pending")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (pendErr) {
      console.error("[KRUG-ADD-MEMBER] invitation lookup error", pendErr);
      return json({ error: "lookup_failed" }, 200);
    }
    if (pending) {
      return json({ error: "already_invited" }, 200);
    }

    const { data: inserted, error: insErr } = await admin
      .from("krug_invitations")
      .insert({
        krug_id: krugId,
        email: normalizedEmail,
        invited_user_id: invitedUserId,
        invited_by: user.id,
        role,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("[KRUG-ADD-MEMBER] invitation insert error", insErr);
      if ((insErr.code || "") === "23505") {
        return json({ error: "already_invited" }, 200);
      }
      return json({ error: "insert_failed", detail: insErr.message }, 200);
    }

    // Notify the invitee. Failure MUST NOT roll back the invitation — logged.
    //
    // Auth: `notify-krug-event` accepts EITHER `KRUG_NOTIFY_INTERNAL_KEY` or the
    // current service role key. We send the internal key explicitly because the
    // service role key has drifted from the value the notifier sees after a
    // platform key rotation before (2026-08-08: every invite notify returned 401).
    // The DB path (`krug_emit_notification` → net.http_post) uses the same
    // internal key and is proven to work. Service key is a last-resort fallback
    // and is loudly warned about so the drift can never be silent again.
    let notified = false;
    try {
      const internalKey = Deno.env.get("KRUG_NOTIFY_INTERNAL_KEY") ?? "";
      if (!internalKey) {
        console.warn(
          "[KRUG-ADD-MEMBER] KRUG_NOTIFY_INTERNAL_KEY missing — falling back to service role key for notify auth",
        );
      }
      const notifyToken = internalKey || serviceKey;

      const { data: notifyRes, error: notifyErr } = await admin.functions.invoke(
        "notify-krug-event",
        {
          headers: { Authorization: `Bearer ${notifyToken}` },
          body: {
            event_type: "krug_invited",
            krug_id: krugId,
            actor_id: user.id,
            dedup_ref: `krug_invited:${inserted.id}`,
            recipient_override: [invitedUserId],
          },
        },
      );
      if (notifyErr) {
        console.error("[KRUG-ADD-MEMBER] notify error", notifyErr);
      } else {
        notified = (notifyRes as { delivered?: number } | null)?.delivered
          ? true
          : false;
        console.log("[KRUG-ADD-MEMBER] notify result", notifyRes);
      }
    } catch (e) {
      console.error("[KRUG-ADD-MEMBER] notify dispatch failed", e);
    }


    return json(
      { ok: true, invitation_id: inserted.id, user_id: invitedUserId, role, notified },
      200,
    );
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
