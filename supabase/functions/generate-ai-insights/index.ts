// Generate AI insights for the dashboard.
// Hybrid: deterministic compute + AI sentence formulation.
// Auth: validates JWT in code (verify_jwt = false in config).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface InsightCandidate {
  id: string;
  type: "anomaly" | "projection" | "recurring" | "info" | "invoice_overdue" | "project_margin" | "cashflow_risk" | "project_budget_burn";
  priority: number; // higher first; operational > anomaly > projection > recurring
  factsHr: string;
  followupHr: string;
  severity: "info" | "positive" | "warning";
}

interface FinalInsight {
  id: string;
  type: string;
  title: string;
  prompt: string;
  severity: string;
}

const startOfMonthUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const endOfMonthUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Optional: force regenerate
    let force = false;
    try { const body = await req.json(); force = !!body?.force; } catch { /* no body */ }

    const today = new Date().toISOString().slice(0, 10);

    // Load profile (language)
    const { data: profile } = await admin
      .from("profiles")
      .select("preferred_language")
      .eq("user_id", user.id)
      .maybeSingle();
    const language = (profile?.preferred_language || "hr") as "hr" | "en" | "de";

    // Load expenses last 35 days (for week-over-week + month projection)
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 35);
    const { data: expenses, error: expErr } = await admin
      .from("expenses")
      .select("id, amount, type, category, date, expense_nature, description, business_profile_id, project_id")
      .eq("user_id", user.id)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false });

    if (expErr) throw expErr;

    // Filter: only personal expenses (no business profile), exclude corrections, exclude income
    const personalExpenses = (expenses || []).filter((e: any) =>
      e.type === "expense" &&
      !e.business_profile_id &&
      e.expense_nature !== "correction"
    );

    if (personalExpenses.length < 10) {
      return new Response(JSON.stringify({ insights: [], reason: "not_enough_data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache check
    if (!force) {
      const { data: cached } = await admin
        .from("ai_insights_cache")
        .select("insights, expense_count_at_generation, language")
        .eq("user_id", user.id)
        .eq("generated_on", today)
        .maybeSingle();
      if (cached) {
        const drift = Math.abs((personalExpenses.length - (cached.expense_count_at_generation || 0)) /
          Math.max(1, cached.expense_count_at_generation || 1));
        if (drift < 0.2 && cached.language === language) {
          return new Response(JSON.stringify({ insights: cached.insights, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ===== Deterministic candidates =====
    const now = new Date();
    const candidates: InsightCandidate[] = [];

    // 1) Week-over-week anomaly per category
    const last7 = new Date(); last7.setUTCDate(last7.getUTCDate() - 7);
    const prev7Start = new Date(); prev7Start.setUTCDate(prev7Start.getUTCDate() - 14);
    const prev7End = new Date(last7);

    const sumByCat = (from: Date, to: Date) => {
      const map = new Map<string, number>();
      for (const e of personalExpenses) {
        const d = new Date(e.date);
        if (d >= from && d < to) {
          map.set(e.category, (map.get(e.category) || 0) + Number(e.amount));
        }
      }
      return map;
    };
    const lastWeek = sumByCat(last7, new Date());
    const prevWeek = sumByCat(prev7Start, prev7End);

    const anomalies: { cat: string; diff: number; pct: number; current: number; prev: number }[] = [];
    for (const [cat, current] of lastWeek.entries()) {
      const prev = prevWeek.get(cat) || 0;
      const diff = current - prev;
      const pct = prev > 0 ? diff / prev : (current > 10 ? 1 : 0);
      if (Math.abs(diff) >= 10 && Math.abs(pct) >= 0.3) {
        anomalies.push({ cat, diff, pct, current, prev });
      }
    }
    anomalies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    for (const a of anomalies.slice(0, 2)) {
      const dir = a.diff > 0 ? "više" : "manje";
      const pctRound = Math.round(Math.abs(a.pct) * 100);
      candidates.push({
        id: `anomaly-${a.cat}`,
        type: "anomaly",
        factsHr: `Zadnjih 7 dana potrošio ${pctRound}% ${dir} na "${a.cat}" (${a.current.toFixed(2)} €) nego prethodnih 7 dana (${a.prev.toFixed(2)} €)`,
        followupHr: `Zašto sam zadnjih 7 dana potrošio ${pctRound}% ${dir} na kategoriju "${a.cat}" nego prethodnih 7 dana? Daj mi konkretnu analizu.`,
        severity: a.diff > 0 ? "warning" : "positive",
      });
    }

    // 2) Month projection
    const monthStart = startOfMonthUTC(now);
    const monthEnd = endOfMonthUTC(now);
    const dayOfMonth = now.getUTCDate();
    const daysInMonth = monthEnd.getUTCDate();
    const monthSpend = personalExpenses
      .filter((e: any) => new Date(e.date) >= monthStart)
      .reduce((s: number, e: any) => s + Number(e.amount), 0);
    const projection = (monthSpend / Math.max(1, dayOfMonth)) * daysInMonth;

    // Active monthly budget (sum of budget_plans active this month, type expense-tracking)
    const { data: budgetRows } = await admin
      .from("budget_plans")
      .select("total_amount, period_type, is_active, start_date, end_date")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const activeMonthlyBudgets = (budgetRows || []).filter((b: any) =>
      (b.period_type || "monthly") === "monthly"
    );
    const monthBudget = activeMonthlyBudgets.reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);

    if (dayOfMonth >= 5) {
      if (monthBudget > 0) {
        const overUnder = monthBudget - projection;
        const positive = overUnder >= 0;
        candidates.push({
          id: "projection-budget",
          type: "projection",
          factsHr: `Po trenutnom tempu (${monthSpend.toFixed(2)} € u ${dayOfMonth} dana) mjesec ćeš završiti na ~${projection.toFixed(2)} €, što je ${positive ? "unutar" : "preko"} budžeta od ${monthBudget.toFixed(2)} € za ${Math.abs(overUnder).toFixed(2)} €`,
          followupHr: `Po trenutnom tempu mjesec završavam ~${projection.toFixed(0)} €, budžet je ${monthBudget.toFixed(0)} €. Što mogu napraviti da ostanem unutar budžeta?`,
          severity: positive ? "positive" : "warning",
        });
      } else {
        candidates.push({
          id: "projection-no-budget",
          type: "projection",
          factsHr: `Po trenutnom tempu (${monthSpend.toFixed(2)} € u ${dayOfMonth} dana) mjesečna projekcija je ~${projection.toFixed(2)} €`,
          followupHr: `Mjesečna projekcija mi je ~${projection.toFixed(0)} €. Je li to razumna razina za moj profil potrošnje? Predloži budžet.`,
          severity: "info",
        });
      }
    }

    // 3) Recurring count fallback
    if (candidates.length < 3) {
      const { data: recurring } = await admin
        .from("recurring_transactions")
        .select("id, name, amount, next_occurrence_date")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gte("next_occurrence_date", monthStart.toISOString().slice(0, 10))
        .lte("next_occurrence_date", monthEnd.toISOString().slice(0, 10));

      if (recurring && recurring.length > 0) {
        const total = recurring.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        candidates.push({
          id: "recurring-count",
          type: "recurring",
          factsHr: `${recurring.length} pretplata/recurring transakcija obnavlja se ovaj mjesec, ukupno ~${total.toFixed(2)} €`,
          followupHr: `Imam ${recurring.length} pretplata ovaj mjesec u ukupnom iznosu ${total.toFixed(0)} €. Pokaži mi detalje i predloži koje bih mogao otkazati.`,
          severity: "info",
        });
      }
    }

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ insights: [], reason: "no_signals" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const top = candidates.slice(0, 3);

    // ===== AI: formulate short titles in target language =====
    const langName = language === "en" ? "English" : language === "de" ? "German" : "Croatian";
    const systemPrompt = `You write very short, factual, friendly insight cards for a personal finance app. Output language: ${langName}. Never invent numbers; use exactly what's provided. Each title 8-14 words, no emojis, no exclamation marks, no quotes around currency. Use the same currency symbol as in the facts.`;

    const userPrompt = `Generate ${top.length} insight card titles. For each input fact, output a one-sentence card title in ${langName} that summarizes the fact naturally.\n\nFacts (in Croatian, translate to ${langName}):\n${top.map((c, i) => `${i + 1}. [${c.type}] ${c.factsHr}`).join("\n")}`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_insights",
            description: "Emit insight card titles in order",
            parameters: {
              type: "object",
              properties: {
                titles: {
                  type: "array",
                  items: { type: "string" },
                  minItems: top.length,
                  maxItems: top.length,
                },
              },
              required: ["titles"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_insights" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "payment_required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, txt);
      // Fallback to raw HR facts
      const fallback: FinalInsight[] = top.map(c => ({
        id: c.id, type: c.type, title: c.factsHr, prompt: c.followupHr, severity: c.severity,
      }));
      return new Response(JSON.stringify({ insights: fallback, fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    let titles: string[] = [];
    try {
      titles = JSON.parse(toolCall?.function?.arguments || "{}").titles || [];
    } catch (e) {
      console.error("parse tool args failed", e);
    }

    const final: FinalInsight[] = top.map((c, i) => ({
      id: c.id,
      type: c.type,
      title: titles[i] || c.factsHr,
      prompt: c.followupHr,
      severity: c.severity,
    }));

    // Upsert cache
    await admin.from("ai_insights_cache").upsert({
      user_id: user.id,
      generated_on: today,
      insights: final,
      expense_count_at_generation: personalExpenses.length,
      language,
    }, { onConflict: "user_id,generated_on" });

    return new Response(JSON.stringify({ insights: final, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
