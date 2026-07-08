// WS3a-2 Batch A — refactored to write i18n keys into notification row.
// Notifies all project members (except the actor) about project activity:
// work logs (added/updated/deleted) and milestones (added/status changed/deleted).
// All notifications go through the 19h participant digest — no instant push.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ActivityType =
  | "work_log_added" | "work_log_updated" | "work_log_deleted"
  | "milestone_added" | "milestone_status_changed" | "milestone_deleted";

interface RequestBody {
  project_id: string;
  activity_type: ActivityType;
  ref_id?: string | null;
  meta?: {
    date?: string;
    hours?: number;
    milestone_name?: string;
    status?: string;
  };
}

/**
 * Server pre-formats the parenthetical detail (locale-neutral: date/hours are
 * pure numbers/ISO strings). The catalog template uses `{{detail}}` verbatim.
 * Format:
 *   - date+hours: " (2026-01-01, 8h)"
 *   - date only:  " (2026-01-01)"
 *   - neither:    ""
 */
function formatWorkLogDetail(meta: RequestBody["meta"]): string {
  if (!meta?.date && !meta?.hours) return "";
  if (meta?.date && meta?.hours) return ` (${meta.date}, ${meta.hours}h)`;
  if (meta?.date) return ` (${meta.date})`;
  return "";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ error: "unauthorized", code: "missing_authorization" }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    const userEmail = claimsData?.claims?.email as string | undefined;

    if (claimsError || !userId) {
      console.error("JWT validation error in notify-project-activity:", claimsError);
      return jsonRes({ error: "unauthorized", code: "invalid_token" }, 401);
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.project_id || !body?.activity_type) {
      return jsonRes({ error: "bad_request", code: "missing_fields" }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("id, name, icon, color, user_id")
      .eq("id", body.project_id)
      .single();

    if (projectError || !project) {
      return jsonRes({ error: "not_found", code: "project_not_found" }, 404);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .single();
    const submitterName = profile?.display_name || userEmail?.split("@")[0] || "Član";

    const { data: members } = await supabaseAdmin
      .from("project_members")
      .select("user_id")
      .eq("project_id", body.project_id)
      .neq("user_id", userId)
      .neq("role", "worker");

    const recipients = new Set<string>();
    if (project.user_id !== userId) recipients.add(project.user_id);
    members?.forEach((m: { user_id: string }) => recipients.add(m.user_id));

    if (recipients.size === 0) {
      return jsonRes({ success: true, delivered: 0 });
    }

    const titleKey = "notifications.project_activity.title";
    const messageKey = `notifications.project_activity.message.${body.activity_type}`;
    const titleVars = { project: project.name };
    const messageVars: Record<string, unknown> = { actor: submitterName };
    if (body.activity_type.startsWith("work_log_")) {
      messageVars.detail = formatWorkLogDetail(body.meta);
    } else if (body.activity_type.startsWith("milestone_")) {
      messageVars.milestone = body.meta?.milestone_name ?? "";
      if (body.activity_type === "milestone_status_changed") {
        messageVars.status = body.meta?.status ?? "";
      }
    }

    const inAppRows = Array.from(recipients).map((rid) => ({
      user_id: rid,
      type: "project_activity",
      title: titleKey,
      message: messageKey,
      data: {
        project_id: project.id,
        project_name: project.name,
        project_icon: project.icon,
        project_color: project.color,
        submitter_name: submitterName,
        activity_type: body.activity_type,
        ref_id: body.ref_id ?? null,
        meta: body.meta ?? null,
        title_vars: titleVars,
        message_vars: messageVars,
      },
    }));

    const { error: notifErr } = await supabaseAdmin.from("notifications").insert(inAppRows);
    if (notifErr) console.error("[notify-project-activity] notifications insert error", notifErr);

    // Instant push disabled — sva aktivnost čeka 19h digest. In-app zvonce ostaje odmah.

    try {
      await supabaseAdmin.rpc("enqueue_participant_digest_event", {
        p_project_id: project.id,
        p_actor_user_id: userId,
        p_event: {
          kind: body.activity_type,
          actor_name: submitterName,
          label: body.meta?.milestone_name ?? body.meta?.date ?? null,
          ref_id: body.ref_id ?? null,
          at: new Date().toISOString(),
        },
      });
    } catch (digestErr) {
      console.error("[notify-project-activity] digest enqueue error", digestErr);
    }

    return jsonRes({
      success: true,
      recipients: recipients.size,
      pushed: 0,
    });

  } catch (err) {
    console.error("[notify-project-activity] unhandled error", err);
    return jsonRes({ error: "internal", code: "unhandled_exception" }, 500);
  }
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
