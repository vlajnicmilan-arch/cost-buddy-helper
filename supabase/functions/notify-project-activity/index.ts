// Notifies all project members (except the actor) about project activity:
// work logs (added/updated/deleted) and milestones (added/status changed/deleted).
// Push notifications are throttled to 1 per 5 minutes per (user, project, bucket).
// In-app notifications are always inserted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
// Instant push disabled — sve projektne aktivnosti idu u 19h digest.


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


function buildText(
  type: ActivityType,
  submitterName: string,
  projectName: string,
  meta: RequestBody["meta"],
): { title: string; body: string } {
  const title = `Aktivnost u projektu „${projectName}"`;
  switch (type) {
    case "work_log_added":
      return {
        title,
        body: `${submitterName} je upisao/la dnevnik${meta?.date ? ` (${meta.date}` : ""}${meta?.hours ? `, ${meta.hours}h)` : meta?.date ? ")" : ""}`,
      };
    case "work_log_updated":
      return { title, body: `${submitterName} je ažurirao/la dnevnik${meta?.date ? ` (${meta.date})` : ""}` };
    case "work_log_deleted":
      return { title, body: `${submitterName} je obrisao/la dnevnik${meta?.date ? ` (${meta.date})` : ""}` };
    case "milestone_added":
      return { title, body: `${submitterName} je dodao/la fazu${meta?.milestone_name ? ` „${meta.milestone_name}"` : ""}` };
    case "milestone_status_changed":
      return {
        title,
        body: `${submitterName} je promijenio/la status faze${meta?.milestone_name ? ` „${meta.milestone_name}"` : ""}${meta?.status ? ` → ${meta.status}` : ""}`,
      };
    case "milestone_deleted":
      return { title, body: `${submitterName} je obrisao/la fazu${meta?.milestone_name ? ` „${meta.milestone_name}"` : ""}` };
  }
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
      return new Response(JSON.stringify({ error: "Nedostaje autorizacija" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Neautorizirani pristup" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.project_id || !body?.activity_type) {
      return new Response(JSON.stringify({ error: "Nedostaju podaci" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch project
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("id, name, icon, color, user_id")
      .eq("id", body.project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Projekt nije pronađen" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Submitter display name
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .single();
    const submitterName = profile?.display_name || userEmail?.split("@")[0] || "Član";

    // Recipients: all members + owner, minus actor
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
      return new Response(JSON.stringify({ success: true, message: "Nema primatelja" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, body: pushBody } = buildText(
      body.activity_type,
      submitterName,
      project.name,
      body.meta,
    );

    // Always insert in-app notifications for everyone
    const inAppRows = Array.from(recipients).map((rid) => ({
      user_id: rid,
      type: "project_activity",
      title,
      message: pushBody,
      data: {
        project_id: project.id,
        project_name: project.name,
        project_icon: project.icon,
        project_color: project.color,
        submitter_name: submitterName,
        activity_type: body.activity_type,
        ref_id: body.ref_id ?? null,
        meta: body.meta ?? null,
      },
    }));

    const { error: notifErr } = await supabaseAdmin.from("notifications").insert(inAppRows);
    if (notifErr) console.error("[notify-project-activity] notifications insert error", notifErr);

    // Instant push disabled — sva aktivnost čeka 19h digest. In-app zvonce ostaje odmah.


    // Enqueue daily digest event (po prostoru). Best-effort; failure must not
    // break the immediate notify flow. Recipient selection happens server-side
    // in the RPC (owner + all members minus actor), independent of role.
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

    return new Response(
      JSON.stringify({
        success: true,
        recipients: recipients.size,
        pushed: 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[notify-project-activity] unhandled error", err);
    return new Response(JSON.stringify({ error: "Greška u funkciji" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
