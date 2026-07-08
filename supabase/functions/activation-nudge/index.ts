/**
 * activation-nudge — Phase 3 (WS3a-2 Batch B: centralized i18n catalog)
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
import { translate } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const KEYS: Record<number, { titleKey: string; bodyKey: string }> = {
  1: {
    titleKey: "notifications.activation_nudge.day1.title",
    bodyKey: "notifications.activation_nudge.day1.message",
  },
  3: {
    titleKey: "notifications.activation_nudge.day3.title",
    bodyKey: "notifications.activation_nudge.day3.message",
  },
  7: {
    titleKey: "notifications.activation_nudge.day7.title",
    bodyKey: "notifications.activation_nudge.day7.message",
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
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - dayNumber);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);

      log(`Day ${dayNumber} window`, {
        start: start.toISOString(),
        end: end.toISOString(),
      });

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

      const { data: ownersOfProjects } = await supabase
        .from("projects")
        .select("user_id")
        .in("user_id", userIds);
      const projectOwners = new Set(
        (ownersOfProjects ?? []).map((r: any) => r.user_id)
      );

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

      const { titleKey, bodyKey } = KEYS[dayNumber];
      // HR fallback pre-rendered; send-push overrides per recipient language.
      const fallbackTitle = translate("hr", titleKey);
      const fallbackBody = translate("hr", bodyKey);

      for (const userId of targets) {
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("projects_enabled")
          .eq("user_id", userId)
          .maybeSingle();

        if (prefs && prefs.projects_enabled === false) {
          log(`Skipping ${userId} — projects category disabled`);
          continue;
        }

        try {
          await sendPushNotification({
            user_id: userId,
            title: fallbackTitle,
            body: fallbackBody,
            data: {
              type: "activation_nudge",
              day: String(dayNumber),
              route: "/projects",
              i18n_title_key: titleKey,
              i18n_body_key: bodyKey,
              title_vars: {},
              message_vars: {},
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

    // Funnel: day7_active logging (unchanged).
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
