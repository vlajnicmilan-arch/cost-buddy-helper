/**
 * activation-nudge — Phase 3
 *
 * Sends Day 1, Day 3 and Day 7 push notifications to users who:
 *   • registered N days ago,
 *   • have NOT created a project yet,
 *   • have not already received the same day-N nudge,
 *   • have project notifications enabled.
 *
 * Trigger: pg_cron, once per day. Idempotent via `activation_nudge_log` UNIQUE.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Lang = "hr" | "en" | "de";
const COPY: Record<number, Record<Lang, { title: string; body: string }>> = {
  1: {
    hr: {
      title: "Dobrodošao u V&M Balance 👋",
      body: "Kreni s prvim projektom — renoviranje, klijent ili osobni cilj.",
    },
    en: {
      title: "Welcome to V&M Balance 👋",
      body: "Start with your first project — renovation, client or personal goal.",
    },
    de: {
      title: "Willkommen bei V&M Balance 👋",
      body: "Starte mit deinem ersten Projekt — Renovierung, Kunde oder persönliches Ziel.",
    },
  },
  3: {
    hr: {
      title: "Spreman za prvi projekt? 🎯",
      body: "Projekti ti pomažu pratiti budžet i troškove na jednom mjestu.",
    },
    en: {
      title: "Ready for your first project? 🎯",
      body: "Projects help you track budget and expenses in one place.",
    },
    de: {
      title: "Bereit für dein erstes Projekt? 🎯",
      body: "Projekte helfen dir, Budget und Ausgaben an einem Ort zu verfolgen.",
    },
  },
  7: {
    hr: {
      title: "Iskusi punu snagu V&M Balance 🚀",
      body: "Otvori prvi projekt u 30s i drži troškove pod kontrolom.",
    },
    en: {
      title: "Unlock the full power of V&M Balance 🚀",
      body: "Create your first project in 30s and stay on top of expenses.",
    },
    de: {
      title: "Entdecke die volle Power von V&M Balance 🚀",
      body: "Erstelle dein erstes Projekt in 30s und behalte Ausgaben im Griff.",
    },
  },
};

const log = (s: string, d?: unknown) =>
  console.log(`[activation-nudge] ${s}${d ? " " + JSON.stringify(d) : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const now = new Date();
    let totalSent = 0;
    const summary: Record<string, number> = { day1: 0, day3: 0, day7: 0 };

    for (const dayNumber of [1, 3, 7] as const) {
      // Window: profiles.created_at between (now - day - 1d) and (now - day)
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - dayNumber);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);

      log(`Day ${dayNumber} window`, {
        start: start.toISOString(),
        end: end.toISOString(),
      });

      // 1. Profiles registered exactly N days ago
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (pErr) {
        log(`Error fetching profiles for day ${dayNumber}`, pErr.message);
        continue;
      }
      if (!profiles || profiles.length === 0) continue;

      const userIds = profiles.map((p: any) => p.user_id);

      // 2. Exclude users who already created at least one project
      const { data: ownersOfProjects } = await supabase
        .from("projects")
        .select("user_id")
        .in("user_id", userIds);
      const projectOwners = new Set(
        (ownersOfProjects ?? []).map((r: any) => r.user_id)
      );

      // 3. Exclude users who already received this day's nudge
      const { data: alreadySent } = await supabase
        .from("activation_nudge_log")
        .select("user_id")
        .eq("day_number", dayNumber)
        .in("user_id", userIds);
      const alreadyNudged = new Set(
        (alreadySent ?? []).map((r: any) => r.user_id)
      );

      const targets = userIds.filter(
        (uid) => !projectOwners.has(uid) && !alreadyNudged.has(uid)
      );

      log(`Day ${dayNumber} targets`, {
        registered: userIds.length,
        withProject: projectOwners.size,
        alreadyNudged: alreadyNudged.size,
        toSend: targets.length,
      });

      for (const userId of targets) {
        // Respect per-user category preference for "projects"
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("projects_enabled")
          .eq("user_id", userId)
          .maybeSingle();

        if (prefs && prefs.projects_enabled === false) {
          log(`Skipping ${userId} — projects category disabled`);
          continue;
        }

        // Detect locale from profile (fallback to HR)
        // We don't store locale on profiles; default to HR.
        const lang: Lang = "hr";
        const copy = COPY[dayNumber][lang];

        try {
          await sendPushNotification({
            user_id: userId,
            title: copy.title,
            body: copy.body,
            data: {
              type: "activation_nudge",
              day: String(dayNumber),
              route: "/projects",
            },
            source: "activation-nudge",
          });

          await supabase
            .from("activation_nudge_log")
            .insert({ user_id: userId, day_number: dayNumber });

          totalSent++;
          summary[`day${dayNumber}`]++;
        } catch (e) {
          log(`Failed to send to ${userId}`, e instanceof Error ? e.message : e);
        }
      }
    }

    // ============================================================
    // Funnel: log day7_active for users who registered exactly 7 days ago
    // and were active (login or app_open) in the last 24h.
    // Idempotent: unique index (user_id, event_name='day7_active') in DB.
    // ============================================================
    let day7Logged = 0;
    try {
      const day7Start = new Date(now);
      day7Start.setUTCDate(day7Start.getUTCDate() - 7);
      day7Start.setUTCHours(0, 0, 0, 0);
      const day7End = new Date(day7Start);
      day7End.setUTCHours(23, 59, 59, 999);

      const { data: profiles7 } = await supabase
        .from("profiles")
        .select("user_id")
        .gte("created_at", day7Start.toISOString())
        .lte("created_at", day7End.toISOString());

      const candidateIds = (profiles7 ?? []).map((p: any) => p.user_id);
      if (candidateIds.length > 0) {
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentLogins } = await supabase
          .from("user_login_logs")
          .select("user_id")
          .in("user_id", candidateIds)
          .gte("logged_in_at", last24h);

        const activeIds = new Set((recentLogins ?? []).map((r: any) => r.user_id));
        for (const uid of activeIds) {
          const { error: insErr } = await supabase.from("funnel_events").insert({
            user_id: uid,
            event_name: "day7_active",
            platform: "cron",
            metadata: { source: "activation-nudge-cron" } as any,
          });
          // 23505 = duplicate, expected if cron retries
          if (!insErr || insErr.code === "23505") day7Logged++;
        }
      }
    } catch (e) {
      log("day7_active block failed", e instanceof Error ? e.message : e);
    }

    log("Done", { totalSent, day7Logged, ...summary });
    return new Response(
      JSON.stringify({ success: true, totalSent, day7Logged, ...summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    log("Fatal", e instanceof Error ? e.message : e);
    return new Response(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
