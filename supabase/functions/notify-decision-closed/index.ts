// Modul "Odluke" — Faza 4: mail sažetak na zatvaranju.
// Trigger: after-trigger na project_decision_steps zove ovu funkciju
// fire-and-forget kad odluka prijeđe u approved/rejected/closed.
//
// Šalje se OBJEMA stranama (vlasnik + investitor), svakome na njegovom jeziku,
// poštuje `is_push_category_enabled(_user_id, 'decisions')` (ista prekidačica
// pokriva push i mail za odluke).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveLang } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const decisionId = body?.decision_id as string | undefined;
    if (!decisionId) {
      return new Response(JSON.stringify({ error: "decision_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: decision, error: decErr } = await supabase
      .from("project_decisions")
      .select("id, project_id, title, current_status, closed_reason, closed_at, contract_amendment_id")
      .eq("id", decisionId)
      .maybeSingle();
    if (decErr || !decision) {
      return new Response(JSON.stringify({ error: "decision not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["approved", "rejected", "closed"].includes(String(decision.current_status))) {
      return new Response(JSON.stringify({ skipped: "not_closed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: steps }, { data: project }, { data: attsCount }] = await Promise.all([
      supabase.from("project_decision_steps")
        .select("step_no, actor_user_id, actor_role, action, message, price, created_at")
        .eq("decision_id", decisionId)
        .order("step_no", { ascending: true }),
      supabase.from("projects").select("id, name, user_id").eq("id", (decision as any).project_id).maybeSingle(),
      supabase.from("project_decision_attachments")
        .select("id", { count: "exact", head: true })
        .eq("decision_id", decisionId),
    ]);

    if (!project) {
      return new Response(JSON.stringify({ error: "project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: investorRow } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", (project as any).id)
      .eq("role", "investor")
      .maybeSingle();

    const ownerId = (project as any).user_id as string;
    const investorId = (investorRow as any)?.user_id as string | undefined;
    const recipients = [ownerId, investorId].filter(Boolean) as string[];
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ skipped: "no_recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Efektivna cijena: najviši step_no s ne-null cijenom
    let effectivePrice: number | null = null;
    const stepsAsc = (steps ?? []) as any[];
    for (let i = stepsAsc.length - 1; i >= 0; i--) {
      const p = stepsAsc[i].price;
      if (p != null && Number(p) !== 0) { effectivePrice = Number(p); break; }
    }

    // Fetch svih display imena u batchu
    const actorIds = Array.from(new Set([...stepsAsc.map(s => s.actor_user_id), ownerId, investorId].filter(Boolean) as string[]));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, preferred_language")
      .in("user_id", actorIds);
    const nameByUser = new Map<string, string>();
    const langByUser = new Map<string, string>();
    for (const p of (profiles as any[] | null) ?? []) {
      nameByUser.set(p.user_id, p.display_name ?? "");
      langByUser.set(p.user_id, resolveLang(p.preferred_language));
    }

    const attachmentsCount = (attsCount as any)?.count ?? 0;

    let sent = 0;
    for (const uid of recipients) {
      // Postoji li kategorija u prefs
      let allowed = true;
      try {
        const { data } = await supabase.rpc("is_push_category_enabled", {
          _user_id: uid,
          _category: "decisions",
        });
        allowed = data !== false;
      } catch {
        // best-effort
      }
      if (!allowed) continue;

      const { data: userRow } = await supabase.auth.admin.getUserById(uid);
      const email = userRow?.user?.email;
      if (!email) continue;

      const lang = langByUser.get(uid) ?? "hr";

      const templateData = {
        lang,
        decisionTitle: (decision as any).title ?? "",
        projectName: (project as any).name ?? "",
        outcome: (decision as any).current_status,
        closedReason: (decision as any).closed_reason ?? null,
        closedAt: (decision as any).closed_at,
        effectivePrice,
        hasAmendment: !!(decision as any).contract_amendment_id,
        attachmentsCount,
        steps: stepsAsc.map((s) => ({
          step_no: s.step_no,
          actor_name: nameByUser.get(s.actor_user_id) || (s.actor_user_id === ownerId ? "Vlasnik" : "Investitor"),
          actor_role: s.actor_role,
          action: s.action,
          message: s.message ?? null,
          price: s.price != null ? Number(s.price) : null,
          created_at: s.created_at,
        })),
      };

      try {
        const resp = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "decision-summary",
            recipientEmail: email,
            idempotencyKey: `decision-summary-${decisionId}-${uid}`,
            templateData,
          },
        });
        if ((resp as any)?.error) {
          console.error("[notify-decision-closed] invoke error", (resp as any).error);
        } else {
          sent++;
        }
      } catch (e) {
        console.error("[notify-decision-closed] send failed", e);
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-decision-closed] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
