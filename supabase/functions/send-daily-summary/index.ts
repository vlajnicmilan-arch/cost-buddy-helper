// Daily spending summary push, sent at 21:00 user-local time.
// Cron poziva ovu funkciju svakih sat (na :00). Funkcija sama filtrira
// samo korisnike čija je trenutna lokalna ura == 21.
//
// Body opcionalno: { test?: boolean, userId?: string } — za test gumb iz Postavki.
//
// Tekst pusha se generira iz "zapažanja" o današnjem danu
// (vidi `_shared/dailySummaryObservations.ts` za logiku),
// pa rotira između konkretnih opservacija (quiet/spike/outlier/new merchant/...).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  computeObservations,
  pickObservation,
  type DailyState,
  type ExpenseLite,
  type Observation,
  type ObservationType,
} from "../_shared/dailySummaryObservations.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Lang = "hr" | "en" | "de";

// =====================  i18n  =====================
// 3-5 varijanti po tipu zapažanja po jeziku — rotacija po dayOfYear.
// Tokeni: {amount}, {currency}, {pct}, {merchant}, {median}, {category}, {days}, {total}.

type StringTable = Record<ObservationType, string[]> & { title: string[] };

const I18N: Record<Lang, StringTable> = {
  hr: {
    title: ["Dnevni sažetak"],
    quiet_day: [
      "Danas {amount} {currency} — oko {pct}% manje nego inače.",
      "Mirniji dan: {amount} {currency}, ispod uobičajenog.",
      "Tih dan: {pct}% ispod prosjeka ({amount} {currency}).",
      "Lakši dan za novčanik — {amount} {currency}.",
    ],
    big_spike: [
      "Danas {amount} {currency} — {pct}% više nego inače.",
      "Snažan dan potrošnje: {amount} {currency}, znatno iznad prosjeka.",
      "Iznad uobičajenog: {amount} {currency} ({pct}% više).",
    ],
    outlier_transaction: [
      "Današnjih {amount} {currency} u {merchant} je iznimka — inače tu trošiš oko {median} {currency}.",
      "Veliki trošak u {merchant} ({amount} {currency}). Uobičajeno ~{median} {currency}.",
      "{merchant} danas {amount} {currency} — više nego inače (prosjek {median} {currency}).",
    ],
    new_merchant: [
      "Prvi put trošiš u {merchant} ({amount} {currency}).",
      "Novi trgovac: {merchant} — {amount} {currency}.",
      "{merchant} je novost u tvojim transakcijama ({amount} {currency}).",
    ],
    category_shift: [
      "Danas dominira {category}: {amount} {currency} od ukupno {total} {currency}.",
      "Neuobičajen dan — najviše u {category} ({amount} {currency}).",
      "{category} je danas pojela najveći dio dana ({amount} {currency}).",
    ],
    zero_spend: [
      "Danas nula transakcija. Rijetko 🙂",
      "0 troškova danas — tih dan.",
      "Bez ijednog troška danas.",
    ],
    streak_milestone: [
      "{days}. dan zaredom unutar budžeta 👍",
      "Solidan niz — {days} dana ispod plana.",
      "Discipliniranih {days} dana zaredom 🎯",
    ],
    streak_broken: [
      "Niz prekinut nakon {days} dana. Sutra novi pokušaj.",
      "Probijen budžet — niz od {days} dana je gotov.",
    ],
    budget_ok_quiet: [
      "Danas potrošeno {amount} {currency}.",
      "{amount} {currency} danas — sve pod kontrolom.",
      "Tihi dan: {amount} {currency}.",
      "Današnja potrošnja: {amount} {currency}.",
    ],
  },
  en: {
    title: ["Daily summary"],
    quiet_day: [
      "Spent {amount} {currency} today — about {pct}% less than usual.",
      "Quieter day: {amount} {currency}, below your average.",
      "A calm day — {pct}% under average ({amount} {currency}).",
    ],
    big_spike: [
      "Today {amount} {currency} — {pct}% more than usual.",
      "Heavy spending day: {amount} {currency}, well above average.",
      "Above the usual: {amount} {currency} ({pct}% more).",
    ],
    outlier_transaction: [
      "Today's {amount} {currency} at {merchant} is unusual — you normally spend ~{median} {currency} there.",
      "Big spend at {merchant} ({amount} {currency}). Usually ~{median} {currency}.",
      "{merchant} cost {amount} {currency} today — more than usual (avg {median} {currency}).",
    ],
    new_merchant: [
      "First time spending at {merchant} ({amount} {currency}).",
      "New merchant: {merchant} — {amount} {currency}.",
      "{merchant} is new on your list ({amount} {currency}).",
    ],
    category_shift: [
      "{category} dominated today: {amount} {currency} of {total} {currency} total.",
      "Unusual day — mostly {category} ({amount} {currency}).",
      "Today was a {category} day ({amount} {currency}).",
    ],
    zero_spend: [
      "Zero transactions today. Rare 🙂",
      "No spending today — quiet day.",
      "A spend-free day.",
    ],
    streak_milestone: [
      "Day {days} in a row within budget 👍",
      "Solid streak — {days} days under plan.",
      "{days} disciplined days in a row 🎯",
    ],
    streak_broken: [
      "Streak ended after {days} days. New try tomorrow.",
      "Budget exceeded — your {days}-day streak is over.",
    ],
    budget_ok_quiet: [
      "Spent {amount} {currency} today.",
      "{amount} {currency} today — all under control.",
      "Quiet day: {amount} {currency}.",
      "Today's spending: {amount} {currency}.",
    ],
  },
  de: {
    title: ["Tagesübersicht"],
    quiet_day: [
      "Heute {amount} {currency} — etwa {pct}% weniger als üblich.",
      "Ruhigerer Tag: {amount} {currency}, unter dem Schnitt.",
      "Sparsamer Tag — {pct}% unter Durchschnitt ({amount} {currency}).",
    ],
    big_spike: [
      "Heute {amount} {currency} — {pct}% mehr als üblich.",
      "Ausgabenstarker Tag: {amount} {currency}, deutlich über Schnitt.",
      "Über dem Üblichen: {amount} {currency} ({pct}% mehr).",
    ],
    outlier_transaction: [
      "Heute {amount} {currency} bei {merchant} ist ungewöhnlich — sonst ~{median} {currency}.",
      "Große Ausgabe bei {merchant} ({amount} {currency}). Üblich ~{median} {currency}.",
      "{merchant} heute {amount} {currency} — mehr als sonst (Ø {median} {currency}).",
    ],
    new_merchant: [
      "Erste Ausgabe bei {merchant} ({amount} {currency}).",
      "Neuer Händler: {merchant} — {amount} {currency}.",
      "{merchant} ist neu auf deiner Liste ({amount} {currency}).",
    ],
    category_shift: [
      "Heute dominiert {category}: {amount} {currency} von {total} {currency} gesamt.",
      "Ungewöhnlicher Tag — vor allem {category} ({amount} {currency}).",
      "Heute war ein {category}-Tag ({amount} {currency}).",
    ],
    zero_spend: [
      "Heute keine Transaktionen. Selten 🙂",
      "Keine Ausgaben heute — stiller Tag.",
      "Ein ausgabenfreier Tag.",
    ],
    streak_milestone: [
      "{days}. Tag in Folge im Budget 👍",
      "Solide Serie — {days} Tage unter Plan.",
      "{days} disziplinierte Tage in Folge 🎯",
    ],
    streak_broken: [
      "Serie nach {days} Tagen beendet. Morgen neuer Versuch.",
      "Budget überschritten — deine {days}-Tage-Serie ist vorbei.",
    ],
    budget_ok_quiet: [
      "Heute {amount} {currency} ausgegeben.",
      "{amount} {currency} heute — alles im Griff.",
      "Stiller Tag: {amount} {currency}.",
      "Heutige Ausgaben: {amount} {currency}.",
    ],
  },
};

function fmtMoney(n: number, lang: Lang): string {
  const locale = lang === "hr" ? "hr-HR" : lang === "de" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, n));
}

function dayOfYear(ymd: string): number {
  const d = new Date(ymd + "T00:00:00Z");
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function renderObservation(
  obs: Observation,
  lang: Lang,
  currency: string,
  todayTotal: number,
  ymd: string,
): { title: string; body: string } {
  const table = I18N[lang];
  const variants = table[obs.type] ?? table.budget_ok_quiet;
  const tpl = variants[dayOfYear(ymd) % variants.length];

  const payload = obs.payload as Record<string, unknown>;
  const amountNum = typeof payload.amount === "number"
    ? (payload.amount as number)
    : todayTotal;
  const medianNum = typeof payload.median === "number"
    ? (payload.median as number)
    : 0;
  const totalNum = typeof payload.todayTotal === "number"
    ? (payload.todayTotal as number)
    : todayTotal;
  const pctNum = typeof payload.pctLess === "number"
    ? (payload.pctLess as number)
    : typeof payload.pctMore === "number"
    ? (payload.pctMore as number)
    : 0;
  const merchantStr = typeof payload.merchant === "string"
    ? (payload.merchant as string)
    : "";
  const categoryStr = typeof payload.category === "string"
    ? (payload.category as string)
    : "";
  const daysNum = typeof payload.days === "number" ? (payload.days as number) : 0;

  const body = tpl
    .replaceAll("{amount}", fmtMoney(amountNum, lang))
    .replaceAll("{median}", fmtMoney(medianNum, lang))
    .replaceAll("{total}", fmtMoney(totalNum, lang))
    .replaceAll("{currency}", currency)
    .replaceAll("{pct}", String(pctNum))
    .replaceAll("{merchant}", merchantStr)
    .replaceAll("{category}", categoryStr)
    .replaceAll("{days}", String(daysNum));

  return { title: table.title[0], body };
}

// =====================  date utils  =====================

function localPartsForTz(tz: string): { hour: number; isWeekend: boolean; ymd: string } {
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
  const wd = get("weekday");
  const isWeekend = wd === "Sat" || wd === "Sun";
  return { hour, isWeekend, ymd };
}

function nDaysAgoYmd(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function yesterdayYmd(ymd: string): string {
  return nDaysAgoYmd(ymd, 1);
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
  state: DailyState;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Test mode
  let testMode = false;
  let testUserId: string | null = null;
  let debugDump = false;
  try {
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b?.test && b?.userId) {
        testMode = true;
        testUserId = String(b.userId);
        debugDump = !!b?.debug;
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
      daily_summary_unopened_streak,
      daily_summary_state
    `)
    .eq("daily_summary_enabled", true);

  if (testMode && testUserId) {
    query = query.eq("user_id", testUserId);
  }

  const { data: prefRows, error: prefErr } = await query;

  if (prefErr) {
    return new Response(JSON.stringify({ error: prefErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userIds = (prefRows ?? []).map((r: any) => r.user_id);
  const profilesMap: Map<string, { timezone: string; preferred_language: string; currency: string }> = new Map();
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
      state: (r.daily_summary_state ?? {}) as DailyState,
    };
  });

  let sent = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {};
  const bump = (k: string) => { reasons[k] = (reasons[k] ?? 0) + 1; };
  const debugInfo: any[] = [];

  for (const c of candidates) {
    try {
      const local = localPartsForTz(c.timezone);

      if (!testMode) {
        if (local.hour !== 21) { skipped++; bump("not_21h"); continue; }
        if (local.isWeekend && !c.weekend_enabled) { skipped++; bump("weekend_off"); continue; }
        if (c.paused_until && c.paused_until >= local.ymd) { skipped++; bump("paused"); continue; }
        if (c.last_sent_on === local.ymd) { skipped++; bump("already_sent"); continue; }
      }

      // Quiet guard
      if (!testMode) {
        const { data: authUser } = await supabase.auth.admin.getUserById(c.user_id);
        const lastSignIn = authUser?.user?.last_sign_in_at
          ? new Date(authUser.user.last_sign_in_at).getTime()
          : 0;
        if (lastSignIn && Date.now() - lastSignIn < 30 * 60 * 1000) {
          skipped++; bump("recent_activity"); continue;
        }
      }

      // Push token check
      const { count: tokenCount } = await supabase
        .from("push_tokens")
        .select("id", { count: "exact", head: true })
        .eq("user_id", c.user_id);
      if (!tokenCount || tokenCount === 0) { skipped++; bump("no_token"); continue; }

      // Fetch last 90 days of expenses (single query) — enough for all observations.
      const fromYmd = nDaysAgoYmd(local.ymd, 90);
      const { data: rawExp } = await supabase
        .from("expenses")
        .select("amount, expense_nature, date, merchant_name, category")
        .eq("user_id", c.user_id)
        .eq("type", "expense")
        .gte("date", fromYmd)
        .lte("date", local.ymd);

      const cleaned = (rawExp ?? []).filter(
        (e: any) =>
          e.expense_nature !== "transfer" && e.expense_nature !== "correction",
      );

      // Today vs history split (date column is TZ-aware timestamp; use first 10 chars)
      const todayExpenses: ExpenseLite[] = [];
      const history: ExpenseLite[] = [];
      for (const e of cleaned) {
        const ymd = String(e.date).slice(0, 10);
        const lite: ExpenseLite = {
          date: ymd,
          amount: Number(e.amount || 0),
          merchant_name: e.merchant_name,
          category: e.category,
        };
        if (ymd === local.ymd) todayExpenses.push(lite);
        else history.push(lite);
      }

      const todayTotal = todayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

      if (todayTotal <= 0 && todayExpenses.length === 0 && !testMode) {
        // Bez troška danas — pošalji samo ako je streak milestone ili streak break.
        // Pa idemo svejedno kroz computeObservations da odlučimo.
      }

      // Budget + streak (kept same logic as before but with helper)
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
      const hasBudget = monthBudget > 0;

      let streakDays = 0;
      let prevStreakDays = 0;
      if (hasBudget) {
        const dailyBudget = monthBudget / 30;
        const byDay = new Map<string, number>();
        for (const e of cleaned) {
          const ymd = String(e.date).slice(0, 10);
          byDay.set(ymd, (byDay.get(ymd) ?? 0) + Number(e.amount || 0));
        }
        for (let i = 0; i < 60; i++) {
          const d = nDaysAgoYmd(local.ymd, i);
          const v = byDay.get(d) ?? 0;
          if (v <= dailyBudget) streakDays++;
          else break;
        }
        // prev streak: streak as of yesterday
        for (let i = 1; i < 61; i++) {
          const d = nDaysAgoYmd(local.ymd, i);
          const v = byDay.get(d) ?? 0;
          if (v <= dailyBudget) prevStreakDays++;
          else break;
        }
      }

      const observations = computeObservations({
        today: local.ymd,
        isWeekend: local.isWeekend,
        todayExpenses,
        history,
        streakDays,
        prevStreakDays,
        hasBudget,
      });

      const chosen = pickObservation(observations, c.state ?? {}, local.ymd);

      // Skip "no_spend" days unless something noteworthy
      if (
        !testMode &&
        todayTotal <= 0 &&
        todayExpenses.length === 0 &&
        chosen.type !== "zero_spend" &&
        chosen.type !== "streak_milestone" &&
        chosen.type !== "streak_broken"
      ) {
        skipped++; bump("no_spend_no_signal"); continue;
      }

      const { title, body } = renderObservation(
        chosen,
        c.preferred_language,
        c.currency || "EUR",
        todayTotal,
        local.ymd,
      );

      if (debugDump) {
        debugInfo.push({
          user_id: c.user_id,
          chosen: chosen.type,
          strength: chosen.strength,
          all: observations.map((o) => ({ type: o.type, strength: o.strength })),
          body,
        });
      }

      await callSendPush(c.user_id, title, body);

      // Update state + accounting
      const newStreak = (c.unopened_streak ?? 0) + 1;
      const payload = chosen.payload as { merchantKey?: string; merchant?: string };
      const newState: DailyState = {
        last_observation_type: chosen.type,
        last_observation_date: local.ymd,
        last_merchant_mentioned: payload.merchantKey ?? payload.merchant ?? null,
      };
      const update: Record<string, any> = {
        daily_summary_last_sent_on: local.ymd,
        daily_summary_unopened_streak: newStreak,
        daily_summary_state: newState,
      };
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

  const responseBody: Record<string, unknown> = {
    sent,
    skipped,
    candidates: candidates.length,
    reasons,
    testMode,
  };
  if (debugDump) responseBody.debug = debugInfo;

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// Suppress unused import warning if any (yesterdayYmd is reserved for future use)
void yesterdayYmd;
