// Admin — uključi/isključi pravo na modul u `user_entitlements`.
// Tablica nema write RLS policy (samo read za vlasnika/admina), pa upis ide
// kroz service role uz eksplicitnu provjeru admin uloge pozivatelja.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODULES = ["smjer", "krug", "projekti", "biznis", "mail_uvoz"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    if (!roles?.some((r: { role: string }) => r.role === "admin")) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => null);
    const userId = body?.user_id;
    const module = body?.module;
    const enabled = body?.enabled;
    const periodEnd: string | null = body?.period_end ?? null;

    if (
      typeof userId !== "string" || userId.length < 10 ||
      typeof module !== "string" || !MODULES.includes(module) ||
      typeof enabled !== "boolean"
    ) {
      return json({ error: "invalid_payload" }, 400);
    }
    if (periodEnd !== null && Number.isNaN(new Date(periodEnd).getTime())) {
      return json({ error: "invalid_period_end" }, 400);
    }

    const nowIso = new Date().toISOString();

    // Admin sloj radi ISKLJUČIVO nad vlastitim redovima (source='admin_grant').
    // Paddle/trial/legacy retke ne diramo.
    const { data: existing, error: readError } = await supabase
      .from("user_entitlements")
      .select("id, status, period_end")
      .eq("user_id", userId)
      .eq("module", module)
      .eq("source", "admin_grant");
    if (readError) return json({ error: readError.message }, 500);

    if (enabled) {
      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from("user_entitlements")
          .update({ status: "active", period_end: periodEnd, updated_at: nowIso })
          .in("id", existing.map((r: { id: string }) => r.id));
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await supabase.from("user_entitlements").insert({
          user_id: userId,
          module,
          source: "admin_grant",
          status: "active",
          period_start: nowIso,
          period_end: periodEnd,
          metadata: { granted_by: caller.id },
        });
        if (error) return json({ error: error.message }, 500);
      }
    } else {
      if (existing && existing.length > 0) {
        // Isključivanje NE briše redak — samo ga označava kao opozvan.
        const { error } = await supabase
          .from("user_entitlements")
          .update({ status: "revoked", updated_at: nowIso })
          .in("id", existing.map((r: { id: string }) => r.id));
        if (error) return json({ error: error.message }, 500);
      }
    }

    const { data: rows, error: finalError } = await supabase
      .from("user_entitlements")
      .select("module, source, status, period_end")
      .eq("user_id", userId);
    if (finalError) return json({ error: finalError.message }, 500);

    return json({ ok: true, rows });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
