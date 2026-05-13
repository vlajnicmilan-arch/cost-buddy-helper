// Daily spending summary push, sent at 21:00 user-local time.
// Cron poziva ovu funkciju svakih sat (na :00). Funkcija sama filtrira
// samo korisnike čija je trenutna lokalna ura == 21.
//
// Body opcionalno: { test?: boolean, userId?: string } — za test gumb iz Postavki.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Lang = "hr" | "en" | "de";

interface Templates {
  title: string;
  // {today}, {month}, {remaining}, {pct}, {currency}
  styleA: string; // potrošnja
  styleB: string; // preostali budžet
  styleC: string; // napredak
  streak: string; // {days}
  belowAvg: string; // prefix
  aboveAvg: string; // prefix
}

const TEMPLATES: Record<Lang, Templates> = {
  hr: {
    title: "Dnevni sažetak",
    styleA: "Danas potrošeno {today} {currency} · ovaj mjesec ukupno {month} {currency}",
    styleB: "Danas {today} {currency} · ostalo {remaining} {currency} do kraja mjeseca",
    styleC: "Danas {today} {currency} · iskorišteno {pct}% mjesečnog budžeta",
    streak: "{days}. dan zaredom unutar budžeta 👍",
    belowAvg: "👍 ispod tjednog prosjeka · ",
    aboveAvg: "iznad tjednog prosjeka · ",
  },
  en: {
    title: "Daily summary",
    styleA: "Spent {today} {currency} today · {month} {currency} this month",
    styleB: "{today} {currency} today · {remaining} {currency} left this month",
    styleC: "{today} {currency} today · {pct}% of monthly budget used",
    streak: "Day {days} in a row within budget 👍",
    belowAvg: "👍 below weekly average · ",
    aboveAvg: "above weekly average · ",
  },
  de: {
    title: "Tagesübersicht",
    styleA: "Heute {today} {currency} ausgegeben · {month} {currency} diesen Monat",
    styleB: "Heute {today} {currency} · {remaining} {currency} bis Monatsende übrig",
    styleC: "Heute {today} {currency} · {pct}% des Monatsbudgets verbraucht",
    streak: "Tag {days} in Folge im Budget 👍",
    belowAvg: "👍 unter Wochenschnitt · ",
    aboveAvg: "über Wochenschnitt · ",
  },
};

function fmtMoney(n: number, lang: Lang): string {
  const locale = lang === "hr" ? "hr-HR" : lang === "de" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, n));
}

function localPartsForTz(tz: string): { hour: number; isWeekend: boolean; ymd: string } {
  // Vraća lokalnu uru (0-23), je li vikend i lokalni datum YYYY-MM-DD u toj zoni.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10);
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  const wd = get("weekday"); // "Sat", "Sun", ...
  const isWeekend = wd === "Sat" || wd === "Sun";
  return { hour, isWeekend, ymd };
}

function startOfMonthYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function nDaysAgoYmd(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function callSendPush(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  const url = `${SUPABASE_URL}/functions/v1/send-push`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      user_id: userId,
      title,
      body,
      data: { category: "daily_summary", source: "send-daily-summary", deeplink: "/index" },
    }),
  });
}

interface Candidate {
  user_id: string;
  timezone: string;
  preferred_language: Lang;
  currency: string;
  weekend_enabled: boolean;
  last_sent_on: string | null;
  paused_until: string | null;
  unopened_streak: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Test mode: ručno pošalji jednom korisniku, bez TZ/sat filtera.
  let testMode = false;
  let testUserId: string | null = null;
  try {
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b?.test && b?.userId) {
        testMode = true;
        testUserId = String(b.userId);
      }
    }
  } catch { /* ignore */ }

  // 1. Skupi kandidate
  let query = supabase
    .from("notification_preferences")
    .select(`
      user_id,
      daily_summary_enabled,
      daily_summary_weekend_enabled,
      daily_summary_last_sent_on,
      daily_summary_paused_until,
      daily_summary_unopened_streak
    `)
    .eq("daily_summary_enabled", true);

  if (testMode && testUserId) {
    query = query.eq("user_id", testUserId);
  }

  // Note: profiles inner-join koristi default FK; ako join ne uspije u Supabase REST,
  // fallback radimo niže s dva odvojena upita.
  const { data: prefRows, error: prefErr } = await query;

  if (prefErr) {
    return new Response(JSON.stringify({ error: prefErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fallback: ako profile join nije vratio, dohvatimo profile odvojeno
  const userIds = (prefRows ?? []).map((r: any) => r.user_id);
  let profilesMap: Map<string, { timezone: string; preferred_language: string; currency: string }> = new Map();
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, timezone, preferred_language, currency")
      .in("user_id", userIds);
    (profs ?? []).forEach((p: any) =>
      profilesMap.set(p.user_id, {
        timezone: p.timezone || "Europe/Zagreb",
        preferred_language: p.preferred_language || "hr",
        currency: p.currency || "EUR",
      }),
    );
  }

  const candidates: Candidate[] = (prefRows ?? []).map((r: any) => {
    const p = profilesMap.get(r.user_id) ?? {
      timezone: "Europe/Zagreb",
      preferred_language: "hr",
      currency: "EUR",
    };
    return {
      user_id: r.user_id,
      timezone: p.timezone,
      preferred_language: (["hr", "en", "de"].includes(p.preferred_language)
        ? p.preferred_language
        : "hr") as Lang,
      currency: p.currency,
      weekend_enabled: !!r.daily_summary_weekend_enabled,
      last_sent_on: r.daily_summary_last_sent_on,
      paused_until: r.daily_summary_paused_until,
      unopened_streak: r.daily_summary_unopened_streak ?? 0,
    };
  });

  let sent = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {};
  const bump = (k: string) => { reasons[k] = (reasons[k] ?? 0) + 1; };

  for (const c of candidates) {
    try {
      const local = localPartsForTz(c.timezone);

      if (!testMode) {
        if (local.hour !== 21) { skipped++; bump("not_21h"); continue; }
        if (local.isWeekend && !c.weekend_enabled) { skipped++; bump("weekend_off"); continue; }
        if (c.paused_until && c.paused_until >= local.ymd) { skipped++; bump("paused"); continue; }
        if (c.last_sent_on === local.ymd) { skipped++; bump("already_sent"); continue; }
      }

      // Quiet guard: korisnik je nedavno bio aktivan
      if (!testMode) {
        const { data: authUser } = await supabase.auth.admin.getUserById(c.user_id);
        const lastSignIn = authUser?.user?.last_sign_in_at
          ? new Date(authUser.user.last_sign_in_at).getTime()
          : 0;
        if (lastSignIn && Date.now() - lastSignIn < 30 * 60 * 1000) {
          skipped++; bump("recent_activity"); continue;
        }
      }

      // Mora imati barem jedan push token
      const { count: tokenCount } = await supabase
        .from("push_tokens")
        .select("id", { count: "exact", head: true })
        .eq("user_id", c.user_id);
      if (!tokenCount || tokenCount === 0) { skipped++; bump("no_token"); continue; }

      // Today spend
      const { data: todayExp } = await supabase
        .from("expenses")
        .select("amount, expense_nature")
        .eq("user_id", c.user_id)
        .eq("type", "expense")
        .eq("date", local.ymd);
      const todaySpend = (todayExp ?? [])
        .filter((e: any) => e.expense_nature !== "transfer" && e.expense_nature !== "correction")
        .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

      if (todaySpend <= 0 && !testMode) { skipped++; bump("no_spend"); continue; }

      // Month spend
      const monthStart = startOfMonthYmd(local.ymd);
      const { data: monthExp } = await supabase
        .from("expenses")
        .select("amount, expense_nature, date")
        .eq("user_id", c.user_id)
        .eq("type", "expense")
        .gte("date", monthStart)
        .lte("date", local.ymd);
      const monthSpend = (monthExp ?? [])
        .filter((e: any) => e.expense_nature !== "transfer" && e.expense_nature !== "correction")
        .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

      // Month budget (suma aktivnih budget_plans monthly za korisnika, bez project_id)
      const { data: budgets } = await supabase
        .from("budget_plans")
        .select("total_amount, period_type, is_active, project_id")
        .eq("user_id", c.user_id)
        .eq("is_active", true)
        .is("project_id", null)
        .eq("period_type", "monthly");
      const monthBudget = (budgets ?? []).reduce(
        (s: number, b: any) => s + Number(b.total_amount || 0),
        0,
      );
      const remaining = Math.max(0, monthBudget - monthSpend);
      const pct = monthBudget > 0 ? Math.min(999, Math.round((monthSpend / monthBudget) * 100)) : 0;

      // 7-day average spend (excluding today)
      const weekStart = nDaysAgoYmd(local.ymd, 7);
      const weekEnd = nDaysAgoYmd(local.ymd, 1);
      const { data: weekExp } = await supabase
        .from("expenses")
        .select("amount, expense_nature, date")
        .eq("user_id", c.user_id)
        .eq("type", "expense")
        .gte("date", weekStart)
        .lte("date", weekEnd);
      const weekTotal = (weekExp ?? [])
        .filter((e: any) => e.expense_nature !== "transfer" && e.expense_nature !== "correction")
        .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const weeklyAvg = weekTotal / 7;

      // Streak: dani zaredom (unatrag, do max 30) gdje je dnevna potrošnja <= dnevni budžet
      let streakDays = 0;
      if (monthBudget > 0) {
        const dailyBudget = monthBudget / 30;
        // Includira i današnji dan
        const lookback = 30;
        const fromYmd = nDaysAgoYmd(local.ymd, lookback - 1);
        const { data: lbExp } = await supabase
          .from("expenses")
          .select("amount, expense_nature, date")
          .eq("user_id", c.user_id)
          .eq("type", "expense")
          .gte("date", fromYmd)
          .lte("date", local.ymd);
        // Grupiraj po danu
        const byDay = new Map<string, number>();
        (lbExp ?? [])
          .filter((e: any) => e.expense_nature !== "transfer" && e.expense_nature !== "correction")
          .forEach((e: any) => {
            byDay.set(e.date, (byDay.get(e.date) ?? 0) + Number(e.amount || 0));
          });
        for (let i = 0; i < lookback; i++) {
          const d = nDaysAgoYmd(local.ymd, i);
          const v = byDay.get(d) ?? 0;
          if (v <= dailyBudget) streakDays++;
          else break;
        }
      }

      // Build message
      const lang = c.preferred_language;
      const T = TEMPLATES[lang];
      const cur = c.currency || "EUR";

      let body: string;
      if (streakDays >= 3 && monthBudget > 0) {
        body = T.streak.replace("{days}", String(streakDays));
      } else {
        const dayOfMonth = parseInt(local.ymd.slice(8, 10), 10);
        const variant = dayOfMonth % 3; // 0,1,2
        const hasBudget = monthBudget > 0;
        let chosen = "A";
        if (variant === 1 && hasBudget) chosen = "B";
        else if (variant === 2 && hasBudget) chosen = "C";

        const tpl = chosen === "B" ? T.styleB : chosen === "C" ? T.styleC : T.styleA;
        body = tpl
          .replaceAll("{today}", fmtMoney(todaySpend, lang))
          .replaceAll("{month}", fmtMoney(monthSpend, lang))
          .replaceAll("{remaining}", fmtMoney(remaining, lang))
          .replaceAll("{pct}", String(pct))
          .replaceAll("{currency}", cur);
      }

      // Adaptive prefix
      if (weeklyAvg > 0 && !body.endsWith("👍")) {
        if (todaySpend < 0.7 * weeklyAvg) body = T.belowAvg + body;
        else if (todaySpend > 1.5 * weeklyAvg) body = T.aboveAvg + body;
      }

      await callSendPush(c.user_id, T.title, body);

      // Mark sent + bump unopened streak (will be reset to 0 on app open elsewhere)
      const newStreak = (c.unopened_streak ?? 0) + 1;
      const update: Record<string, any> = {
        daily_summary_last_sent_on: local.ymd,
        daily_summary_unopened_streak: newStreak,
      };
      // Anti-spam auto-pauza nakon 7 dana neotvaranja
      if (newStreak >= 7) {
        const pauseUntil = new Date(local.ymd + "T00:00:00Z");
        pauseUntil.setUTCDate(pauseUntil.getUTCDate() + 30);
        update.daily_summary_paused_until = pauseUntil.toISOString().slice(0, 10);
        update.daily_summary_unopened_streak = 0;
      }
      await supabase
        .from("notification_preferences")
        .update(update)
        .eq("user_id", c.user_id);

      sent++;
    } catch (e) {
      skipped++;
      bump("error");
      console.error("[send-daily-summary] user", c.user_id, e);
    }
  }

  return new Response(
    JSON.stringify({ sent, skipped, candidates: candidates.length, reasons, testMode }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
