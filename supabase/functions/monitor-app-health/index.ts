// Cron-driven app health monitor.
// Runs every 5 minutes, scans recent diagnostic events, groups errors by
// signature (event + first line of message + route) and pushes a notification
// to admin users when thresholds are exceeded — with 30-min anti-spam guard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// thresholds
const WINDOW_MIN = 5;
const MIN_ERRORS = 10;       // total errors in window
const MIN_USERS = 3;         // distinct sessions
const DEDUP_MIN = 30;        // do not re-alert same signature within N min

interface DiagRow {
  event: string;
  route: string | null;
  session_id: string;
  details: any;
  created_at: string;
}

const firstLine = (s: string | undefined | null) => {
  if (!s) return "(no message)";
  const t = String(s).split("\n")[0].trim();
  return t.length > 200 ? t.slice(0, 200) : t;
};

const buildSignature = (event: string, msg: string, route: string | null) =>
  `${event}|${route ?? "?"}|${msg}`.toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();

  try {
    const sinceIso = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

    const { data: rows, error } = await supabase
      .from("app_diagnostics_logs")
      .select("event, route, session_id, details, created_at")
      .in("event", ["window_error", "unhandled_rejection"])
      .gte("created_at", sinceIso)
      .limit(2000);

    if (error) throw error;

    const events = (rows ?? []) as DiagRow[];

    // group by signature
    const groups = new Map<
      string,
      {
        event: string;
        route: string | null;
        sample_message: string;
        sessions: Set<string>;
        count: number;
      }
    >();

    for (const ev of events) {
      const msg = firstLine(ev.details?.message);
      const sig = buildSignature(ev.event, msg, ev.route);
      const g = groups.get(sig) ?? {
        event: ev.event,
        route: ev.route,
        sample_message: msg,
        sessions: new Set<string>(),
        count: 0,
      };
      g.sessions.add(ev.session_id);
      g.count += 1;
      groups.set(sig, g);
    }

    // pick triggering groups
    const dedupSinceIso = new Date(Date.now() - DEDUP_MIN * 60_000).toISOString();
    const triggered: Array<{
      signature: string;
      event: string;
      route: string | null;
      sample_message: string;
      count: number;
      users: number;
    }> = [];

    for (const [sig, g] of groups.entries()) {
      const usersCount = g.sessions.size;
      if (g.count >= MIN_ERRORS || usersCount >= MIN_USERS) {
        // dedup check
        const { data: recent } = await supabase
          .from("monitor_alerts_log")
          .select("id")
          .eq("alert_signature", sig)
          .gte("triggered_at", dedupSinceIso)
          .limit(1);
        if (recent && recent.length > 0) continue;

        triggered.push({
          signature: sig,
          event: g.event,
          route: g.route,
          sample_message: g.sample_message,
          count: g.count,
          users: usersCount,
        });
      }
    }

    let notifiedTotal = 0;

    if (triggered.length > 0) {
      // find admins
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const adminIds = (adminRoles ?? []).map((r: any) => r.user_id);

      for (const t of triggered) {
        // insert alert row
        const { data: insertedRows } = await supabase
          .from("monitor_alerts_log")
          .insert({
            alert_signature: t.signature,
            error_count: t.count,
            affected_users: t.users,
            sample_message: t.sample_message,
            sample_route: t.route,
            details: { event: t.event, window_min: WINDOW_MIN },
          })
          .select("id")
          .single();

        const title = `🔴 V&M Balance: ${t.count} grešaka u ${WINDOW_MIN} min`;
        const body = `${t.users} korisnika · ${t.route ?? "?"} · ${t.sample_message}`;

        let pushed = 0;
        for (const adminId of adminIds) {
          try {
            const { data, error: pushErr } = await supabase.functions.invoke(
              "send-push",
              {
                body: {
                  user_id: adminId,
                  title,
                  body,
                  data: {
                    type: "monitor_alert",
                    alert_id: insertedRows?.id ?? "",
                    signature: t.signature,
                  },
                  source_function: "monitor-app-health",
                  lifecycle_stage: "monitor",
                },
              }
            );
            if (!pushErr && data) pushed += 1;
          } catch (e) {
            console.warn("[monitor] push failed:", e);
          }
        }

        if (insertedRows?.id) {
          await supabase
            .from("monitor_alerts_log")
            .update({ notified: pushed > 0 })
            .eq("id", insertedRows.id);
        }

        notifiedTotal += pushed;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: events.length,
        groups: groups.size,
        triggered: triggered.length,
        notifications_sent: notifiedTotal,
        duration_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[monitor-app-health] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
