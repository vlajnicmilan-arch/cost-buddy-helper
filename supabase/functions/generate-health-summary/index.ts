// Admin-only daily health summary generator.
// Aggregates last 24h of diagnostics and asks Lovable AI Gateway
// (gemini-2.5-flash-lite) to produce a short paragraph in the requested
// language (hr/en/de). Result is stored in `health_summaries`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- AUTH: require admin ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await supabaseAuth
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!roles?.some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- INPUT ----
    const body = await req.json().catch(() => ({}));
    const language: string = ["hr", "en", "de"].includes(body?.language)
      ? body.language
      : "hr";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const sinceIso = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    // ---- AGGREGATE last 24h ----
    const { data: rows, error: rowsErr } = await supabase
      .from("app_diagnostics_logs")
      .select("event, route, session_id, app_version, details, created_at")
      .gte("created_at", sinceIso)
      .limit(5000);

    if (rowsErr) throw rowsErr;

    const events = rows ?? [];
    const sessions = new Set<string>();
    const errors: any[] = [];
    const routeCounts = new Map<string, number>();
    const versionCounts = new Map<string, number>();
    const perfByRoute = new Map<string, number[]>();

    for (const ev of events) {
      sessions.add(ev.session_id);
      if (ev.event === "window_error" || ev.event === "unhandled_rejection") {
        errors.push({
          msg: String(ev.details?.message ?? "").split("\n")[0].slice(0, 160),
          route: ev.route,
        });
      }
      if (ev.route) {
        routeCounts.set(ev.route, (routeCounts.get(ev.route) ?? 0) + 1);
      }
      if (ev.app_version) {
        versionCounts.set(ev.app_version, (versionCounts.get(ev.app_version) ?? 0) + 1);
      }
      if (ev.event === "performance_metric" && ev.details?.duration_ms) {
        const r = ev.route ?? "?";
        const arr = perfByRoute.get(r) ?? [];
        arr.push(Number(ev.details.duration_ms));
        perfByRoute.set(r, arr);
      }
    }

    const topRoutes = [...routeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, count]) => ({ route, count }));

    const versions = [...versionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([version, count]) => ({ version, count }));

    const errorTopMsgs = (() => {
      const c = new Map<string, number>();
      for (const e of errors) {
        const k = `${e.route ?? "?"} :: ${e.msg}`;
        c.set(k, (c.get(k) ?? 0) + 1);
      }
      return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    })();

    const perfSummary = [...perfByRoute.entries()]
      .map(([route, arr]) => {
        const sorted = [...arr].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
        return { route, samples: arr.length, p50, p95 };
      })
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 5);

    const metrics = {
      window_hours: 24,
      sessions: sessions.size,
      events: events.length,
      errors: errors.length,
      top_routes: topRoutes,
      app_versions: versions,
      top_errors: errorTopMsgs.map(([k, v]) => ({ key: k, count: v })),
      performance: perfSummary,
    };

    // ---- AI summary ----
    const langLabel = language === "hr" ? "hrvatskom" : language === "de" ? "njemačkom" : "engleskom";

    const systemPrompt = `Ti si stručnjak za nadzor aplikacija. Odgovaraj isključivo na ${langLabel} jeziku. Daj kratak (3-6 rečenica) tehničko-poslovni sažetak stanja aplikacije u zadnja 24 sata na temelju proslijeđenih metrika. Naglasi probleme (greške, sporne rute, neažurirane verzije), ali budi sažet i konkretan. Ne izmišljaj brojeve.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `METRIKE (JSON):\n${JSON.stringify(metrics, null, 2)}` },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`AI gateway: ${aiResp.status} ${errText.slice(0, 200)}`);
    }

    const aiData = await aiResp.json();
    const summaryText: string =
      aiData?.choices?.[0]?.message?.content?.trim() ?? "(no summary)";

    // ---- store ----
    const { data: stored, error: storeErr } = await supabase
      .from("health_summaries")
      .insert({
        language,
        summary_text: summaryText,
        metrics_json: metrics,
        generated_by: userData.user.id,
      })
      .select()
      .single();

    if (storeErr) throw storeErr;

    return new Response(
      JSON.stringify({ ok: true, summary: stored, metrics }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[generate-health-summary] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
