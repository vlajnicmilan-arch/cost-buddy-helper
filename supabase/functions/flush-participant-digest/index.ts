// Daily flush of participant_digest_state.
// - Triggered by pg_cron at 19:00 UTC.
// - Per (user_id, project_id) row with pending_count > 0 AND
//   (last_sent_at IS NULL OR last_sent_at < now() - 20h),
//   atomically drains pending events via drain_participant_digest RPC,
//   then sends ONE push per project space ("po prostoru") with a short summary.
// - Best-effort: a push failure does NOT roll back the drain — events are
//   considered "delivered as digest" once we have called the function once
//   per (user, project) per day.
//
// Recipient-type independent: enqueue_participant_digest_event already adds
// every recipient (owner + members minus actor); this function does not
// re-segment by role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { sendPushNotificationToMany } from "../_shared/sendPushNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Min interval between digest sends per (user, project). Cron is daily, but
// keep an explicit guard so manual invocations cannot double-send.
const MIN_INTERVAL_HOURS = 20;

interface PendingRow {
  user_id: string;
  project_id: string;
  pending_count: number;
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

function buildSummaryBody(count: number, summary: unknown[]): string {
  // Sažeta poruka: ukupan broj + prve 3 stavke ako su strukturirane.
  if (count <= 0) return "Nema novih događaja.";
  const headline = count === 1
    ? "1 nova promjena u projektu"
    : `${count} novih promjena u projektu`;

  if (!Array.isArray(summary) || summary.length === 0) {
    return headline;
  }
  const sample = summary
    .slice(0, 3)
    .map((evt) => {
      if (typeof evt === "string") return evt;
      const obj = evt as Record<string, unknown>;
      const actor = typeof obj.actor_name === "string" ? obj.actor_name : null;
      const kind = typeof obj.kind === "string" ? obj.kind : null;
      const label = typeof obj.label === "string" ? obj.label : null;
      const parts = [actor, kind, label].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : null;
    })
    .filter((s): s is string => !!s);

  if (sample.length === 0) return headline;
  return `${headline}: ${sample.join("; ")}${count > sample.length ? "…" : ""}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();
  let dueCount = 0;
  let sentCount = 0;
  let errorCount = 0;

  // --- Test mode ---------------------------------------------------------
  // Body: { test: true } → require Authorization header, scope strictly to
  // the caller's user_id, bypass 20h cooldown, and auto-enqueue a synthetic
  // event into one of the caller's projects if no pending row exists yet.
  // This closes the QA loop: enqueue → drain → push with one click.
  let testMode = false;
  let testUserId: string | null = null;
  let testProjectIdHint: string | null = null;
  try {
    if (req.method === "POST") {
      const raw = await req.text();
      if (raw) {
        const parsed = JSON.parse(raw) as {
          test?: boolean;
          project_id?: string;
        };
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
    // Test bootstrap: ensure caller has a pending row to drain.
    if (testMode && testUserId) {
      // Pick a project: explicit hint > most recent owned/joined project.
      let projectId = testProjectIdHint;
      if (!projectId) {
        const { data: ownProj } = await admin
          .from("projects")
          .select("id, created_at")
          .eq("user_id", testUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ownProj?.id) {
          projectId = ownProj.id;
        } else {
          const { data: memProj } = await admin
            .from("project_members")
            .select("project_id, created_at")
            .eq("user_id", testUserId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          projectId = memProj?.project_id ?? null;
        }
      }
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: "no_project_for_test_user" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Inject a synthetic pending event directly (bypass enqueue RPC which
      // filters out the actor — in test we WANT to push to the caller).
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

    // 1) Collect due rows. In test mode: only the caller's rows, no cooldown.
    let query = admin
      .from("participant_digest_state")
      .select("user_id, project_id, pending_count, last_sent_at")
      .gt("pending_count", 0)
      .limit(1000);

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
        JSON.stringify({
          success: true,
          due: 0,
          sent: 0,
          test_mode: testMode,
          took_ms: Date.now() - startedAt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Pre-fetch project metadata in batch.
    const projectIds = Array.from(new Set((due as PendingRow[]).map((r) => r.project_id)));
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, icon, color")
      .in("id", projectIds);
    const projectById = new Map<string, ProjectMeta>(
      (projects ?? []).map((p: ProjectMeta) => [p.id, p]),
    );

    // 3) Per row: drain → send push (best-effort).
    for (const row of due as PendingRow[]) {
      const project = projectById.get(row.project_id);
      if (!project) {
        // Project gone (cascaded). Drain anyway so the row resets.
        await admin.rpc("drain_participant_digest", {
          p_user_id: row.user_id,
          p_project_id: row.project_id,
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

      const snapshot = (Array.isArray(drained) ? drained[0] : drained) as
        | DrainedRow
        | undefined;
      const count = snapshot?.pending_count ?? 0;
      const summary = (snapshot?.pending_summary ?? []) as unknown[];
      if (count <= 0) continue;

      const title = `Sažetak: „${project.name}"`;
      const body = buildSummaryBody(count, summary);

      try {
        await sendPushNotificationToMany([row.user_id], {
          title,
          body,
          data: {
            type: "participant_digest",
            category: "projects",
            project_id: project.id,
            project_name: project.name,
            project_icon: project.icon,
            project_color: project.color,
            event_count: count,
          },
          source: "flush-participant-digest",
        });
        sentCount += 1;
      } catch (pushErr) {
        console.error("[flush-participant-digest] push error", row, pushErr);
        errorCount += 1;
        // Already drained — do not re-enqueue. Acceptable per "best-effort" contract.
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        due: dueCount,
        sent: sentCount,
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
