// Hourly flush of participant_digest_state.
// - Cron pings this function every hour on the hour.
// - For each due (user, project), checks the user's local hour vs their
//   `notification_preferences.participant_digest_hour` (default 19).
//   Only users whose local hour matches AND who have
//   `participant_digest_enabled = true` get drained.
// - Sends ONE push per (user, project) per day.
// - Test mode (POST { test:true }) bypasses tz/cooldown gates and pushes
//   immediately to the caller — used by the Settings test button.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { sendPushNotificationToMany } from "../_shared/sendPushNotification.ts";
import { translate } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MIN_INTERVAL_HOURS = 20;
const DEFAULT_HOUR = 19;
const DEFAULT_TZ = "Europe/Zagreb";

interface PendingRow {
  user_id: string;
  project_id: string;
  pending_count: number;
  last_sent_at: string | null;
}

interface ProjectMeta {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface DrainedRow {
  pending_count: number;
  pending_summary: unknown;
}

function localHourForTz(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const h = parts.find((p) => p.type === "hour")?.value ?? "0";
    return parseInt(h, 10);
  } catch {
    return new Date().getUTCHours();
  }
}

interface DigestBodySelection {
  key: string;
  vars: Record<string, unknown>;
}

// Event `kind` labels are code strings by design and never translated.
// The summary suffix is code-composed and passed to the catalog as a single
// `{{samples}}` variable so translations stay simple.
function buildSummaryBodySelection(count: number, summary: unknown[]): DigestBodySelection {
  if (count <= 0) {
    return { key: "notifications.participant_digest.body.empty", vars: {} };
  }

  let samples = "";
  if (Array.isArray(summary) && summary.length > 0) {
    const parts = summary
      .slice(0, 3)
      .map((evt) => {
        if (typeof evt === "string") return evt;
        const obj = evt as Record<string, unknown>;
        const actor = typeof obj.actor_name === "string" ? obj.actor_name : null;
        const kind = typeof obj.kind === "string" ? obj.kind : null;
        const label = typeof obj.label === "string" ? obj.label : null;
        const parts2 = [actor, kind, label].filter(Boolean);
        return parts2.length > 0 ? parts2.join(" · ") : null;
      })
      .filter((s): s is string => !!s);
    if (parts.length > 0) {
      samples = `${parts.join("; ")}${count > parts.length ? "…" : ""}`;
    }
  }

  if (count === 1) {
    return samples
      ? { key: "notifications.participant_digest.body.single_with_samples", vars: { samples } }
      : { key: "notifications.participant_digest.body.single_no_samples", vars: {} };
  }
  return samples
    ? { key: "notifications.participant_digest.body.many_with_samples", vars: { count, samples } }
    : { key: "notifications.participant_digest.body.many_no_samples", vars: { count } };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();
  let dueCount = 0;
  let sentCount = 0;
  let errorCount = 0;
  let tzSkipped = 0;
  let optOutSkipped = 0;

  // --- Test mode ---------------------------------------------------------
  let testMode = false;
  let testUserId: string | null = null;
  let testProjectIdHint: string | null = null;
  try {
    if (req.method === "POST") {
      const raw = await req.text();
      if (raw) {
        const parsed = JSON.parse(raw) as { test?: boolean; project_id?: string };
        if (parsed?.test === true) {
          const authHeader = req.headers.get("Authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return new Response(
              JSON.stringify({ error: "auth_required_for_test" }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          const supabaseUser = createClient(
            SUPABASE_URL,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: authHeader } } },
          );
          const token = authHeader.replace("Bearer ", "");
          const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getClaims(token);
          const uid = claimsData?.claims?.sub as string | undefined;
          if (claimsErr || !uid) {
            return new Response(
              JSON.stringify({ error: "invalid_token" }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          testMode = true;
          testUserId = uid;
          testProjectIdHint = parsed.project_id ?? null;
        }
      }
    }
  } catch (parseErr) {
    console.warn("[flush-participant-digest] body parse skipped", parseErr);
  }

  try {
    // Test mode bootstrap: synthetic event in a project the caller has.
    if (testMode && testUserId) {
      let projectId = testProjectIdHint;
      if (!projectId) {
        const { data: ownProj } = await admin
          .from("projects").select("id, created_at")
          .eq("user_id", testUserId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (ownProj?.id) projectId = ownProj.id;
        else {
          const { data: memProj } = await admin
            .from("project_members").select("project_id, created_at")
            .eq("user_id", testUserId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          projectId = memProj?.project_id ?? null;
        }
      }
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: "no_project_for_test_user" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await admin
        .from("participant_digest_state")
        .upsert({
          user_id: testUserId,
          project_id: projectId,
          pending_count: 1,
          pending_summary: [{
            kind: "test_event",
            actor_name: "QA",
            label: "manual test trigger",
            at: new Date().toISOString(),
          }],
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,project_id" });
    }

    // 1) Due rows (pending > 0, cooldown respected unless test).
    let query = admin
      .from("participant_digest_state")
      .select("user_id, project_id, pending_count, last_sent_at")
      .gt("pending_count", 0)
      .limit(2000);

    if (testMode && testUserId) {
      query = query.eq("user_id", testUserId);
    } else {
      const cutoffIso = new Date(Date.now() - MIN_INTERVAL_HOURS * 3600_000).toISOString();
      query = query.or(`last_sent_at.is.null,last_sent_at.lt.${cutoffIso}`);
    }

    const { data: due, error: dueErr } = await query;
    if (dueErr) throw dueErr;
    dueCount = due?.length ?? 0;

    if (dueCount === 0) {
      return new Response(
        JSON.stringify({ success: true, due: 0, sent: 0, test_mode: testMode, took_ms: Date.now() - startedAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Pre-fetch tz prefs (skip in test mode — bypass gates).
    const userIds = Array.from(new Set((due as PendingRow[]).map((r) => r.user_id)));
    const prefsByUser = new Map<string, { tz: string; hour: number; enabled: boolean }>();

    if (!testMode) {
      const { data: profs } = await admin
        .from("profiles")
        .select("user_id, timezone")
        .in("user_id", userIds);
      const tzByUser = new Map<string, string>(
        (profs ?? []).map((p: { user_id: string; timezone: string | null }) => [p.user_id, p.timezone || DEFAULT_TZ]),
      );

      const { data: prefRows } = await admin
        .from("notification_preferences")
        .select("user_id, participant_digest_enabled, participant_digest_hour")
        .in("user_id", userIds);
      const prefMap = new Map<string, { enabled: boolean; hour: number }>(
        (prefRows ?? []).map((r: { user_id: string; participant_digest_enabled: boolean | null; participant_digest_hour: number | null }) => [
          r.user_id,
          {
            enabled: r.participant_digest_enabled ?? true,
            hour: r.participant_digest_hour ?? DEFAULT_HOUR,
          },
        ]),
      );

      for (const uid of userIds) {
        prefsByUser.set(uid, {
          tz: tzByUser.get(uid) ?? DEFAULT_TZ,
          hour: prefMap.get(uid)?.hour ?? DEFAULT_HOUR,
          enabled: prefMap.get(uid)?.enabled ?? true,
        });
      }
    }

    // 3) Project meta batch.
    const projectIds = Array.from(new Set((due as PendingRow[]).map((r) => r.project_id)));
    const { data: projects } = await admin
      .from("projects").select("id, name, icon, color").in("id", projectIds);
    const projectById = new Map<string, ProjectMeta>(
      (projects ?? []).map((p: ProjectMeta) => [p.id, p]),
    );

    // 4) Per row: tz/opt-out gate → drain → push.
    for (const row of due as PendingRow[]) {
      if (!testMode) {
        const prefs = prefsByUser.get(row.user_id);
        if (!prefs) continue;
        if (!prefs.enabled) { optOutSkipped += 1; continue; }
        const localHour = localHourForTz(prefs.tz);
        if (localHour !== prefs.hour) { tzSkipped += 1; continue; }
      }

      const project = projectById.get(row.project_id);
      if (!project) {
        await admin.rpc("drain_participant_digest", {
          p_user_id: row.user_id, p_project_id: row.project_id,
        });
        continue;
      }

      const { data: drained, error: drainErr } = await admin.rpc(
        "drain_participant_digest",
        { p_user_id: row.user_id, p_project_id: row.project_id },
      );
      if (drainErr) {
        console.error("[flush-participant-digest] drain error", row, drainErr);
        errorCount += 1;
        continue;
      }

      const snapshot = (Array.isArray(drained) ? drained[0] : drained) as DrainedRow | undefined;
      const count = snapshot?.pending_count ?? 0;
      const summary = (snapshot?.pending_summary ?? []) as unknown[];
      if (count <= 0) continue;

      const titleKey = "notifications.participant_digest.title";
      const titleVars = { project: project.name };
      const bodySel = buildSummaryBodySelection(count, summary);

      // HR fallback pre-rendered — send-push overrides via i18n keys per recipient.
      const title = translate("hr", titleKey, titleVars);
      const body = translate("hr", bodySel.key, bodySel.vars);

      const payloadData = {
        type: "participant_digest",
        category: "projects",
        project_id: project.id,
        project_name: project.name,
        project_icon: project.icon,
        project_color: project.color,
        event_count: count,
        route: `/projects?id=${project.id}`,
        fallback_route: "/projects",
        highlight_type: "project",
        highlight_id: project.id,
        highlight_tab: "activity",
        i18n_title_key: titleKey,
        i18n_body_key: bodySel.key,
        title_vars: titleVars,
        message_vars: bodySel.vars,
      };

      try {
        await sendPushNotificationToMany([row.user_id], {
          title,
          body,
          data: payloadData,
          source: "flush-participant-digest",
        });
        sentCount += 1;
      } catch (pushErr) {
        console.error("[flush-participant-digest] push error", row, pushErr);
        errorCount += 1;
      }

      // Bell entry — store i18n keys so client renders per user language.
      if (!testMode) {
        try {
          await admin.from("notifications").insert({
            user_id: row.user_id,
            type: "participant_digest",
            title: titleKey,
            message: bodySel.key,
            data: payloadData,
            dedup_key: `digest:${project.id}:${new Date().toISOString().slice(0, 10)}`,
          });
        } catch (bellErr) {
          console.warn("[flush-participant-digest] bell insert skipped", row, bellErr);
        }
      }
    }

    // Telemetry: one funnel_events row per run with non-zero sent count.
    try {
      if (sentCount > 0) {
        await admin.from("funnel_events").insert({
          event_name: "digest_sent",
          platform: "edge",
          metadata: {
            source: "flush-participant-digest",
            due: dueCount,
            sent: sentCount,
            tz_skipped: tzSkipped,
            opt_out_skipped: optOutSkipped,
            errors: errorCount,
            test_mode: testMode,
          },
        });
      }
    } catch (telErr) {
      console.warn("[flush-participant-digest] funnel log skipped", telErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        due: dueCount,
        sent: sentCount,
        tz_skipped: tzSkipped,
        opt_out_skipped: optOutSkipped,
        errors: errorCount,
        test_mode: testMode,
        took_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[flush-participant-digest] fatal", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e), due: dueCount, sent: sentCount }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
