import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { translate } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all milestones with due dates that are not completed
    const { data: milestones, error: mError } = await supabase
      .from("project_milestones")
      .select("id, project_id, name, due_date, reminder_days_before, status")
      .not("due_date", "is", null)
      .neq("status", "completed");

    if (mError) throw mError;

    let notificationsCreated = 0;

    for (const milestone of milestones || []) {
      const dueDate = new Date(milestone.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const reminderDays = milestone.reminder_days_before ?? 3;
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() - reminderDays);

      if (today < reminderDate) continue;

      // Dedup pravila (Milan odobrio, sprječava dnevnu lavinu za istekle faze):
      // - upcoming (pre-deadline): 1×/dan po (user, milestone)
      // - overdue: 1× ODMAH pri isteku, potom NJEŽNI TJEDNI podsjetnik (1×/7 dana)
      //   dok je faza istekla i neriješena — NIKAD dnevno zauvijek.
      const daysUntilDueCheck = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const dedupSinceIso = daysUntilDueCheck < 0
        ? new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() // overdue: 7 dana
        : today.toISOString(); // upcoming: današnji dan

      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("type", "milestone_deadline")
        .contains("data", { milestone_id: milestone.id })
        .gte("created_at", dedupSinceIso)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Get project managers (owner + managers)
      const { data: project } = await supabase
        .from("projects")
        .select("user_id, name")
        .eq("id", milestone.project_id)
        .single();

      if (!project) continue;

      // Recipients: project owner only (manager role removed in F8–F10 realign).
      const userIds = new Set<string>([project.user_id]);

      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isOverdue = daysUntilDue < 0;

      const titleKey = isOverdue
        ? "notifications.milestone_deadline.overdue.title"
        : "notifications.milestone_deadline.upcoming.title";
      const messageKey = isOverdue
        ? "notifications.milestone_deadline.overdue.message"
        : "notifications.milestone_deadline.upcoming.message";

      const titleVars = isOverdue
        ? { name: milestone.name }
        : { name: milestone.name, days: daysUntilDue };
      const messageVars = isOverdue
        ? { name: milestone.name, project: project.name, days: Math.abs(daysUntilDue) }
        : {
            name: milestone.name,
            project: project.name,
            date: new Date(milestone.due_date).toLocaleDateString("hr-HR"),
          };

      const fallbackTitle = translate("hr", titleKey, titleVars);
      const fallbackMessage = translate("hr", messageKey, messageVars);

      // Create in-app notifications with i18n keys (client renders per language).
      const notifications = Array.from(userIds).map((userId) => ({
        user_id: userId,
        type: "milestone_deadline",
        title: titleKey,
        message: messageKey,
        data: {
          milestone_id: milestone.id,
          project_id: milestone.project_id,
          due_date: milestone.due_date,
          title_vars: titleVars,
          message_vars: messageVars,
        },
      }));

      const { error: insertError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (!insertError) {
        notificationsCreated += notifications.length;

        for (const userId of userIds) {
          try {
            await supabase.functions.invoke("send-push", {
              body: {
                user_id: userId,
                title: fallbackTitle,
                body: fallbackMessage,
                data: {
                  type: "milestone_deadline",
                  milestone_id: milestone.id,
                  project_id: milestone.project_id,
                  category: "reminders",
                  i18n_title_key: titleKey,
                  i18n_body_key: messageKey,
                  title_vars: titleVars,
                  message_vars: messageVars,
                },
              },
            });
          } catch (pushErr) {
            console.warn("Push send failed for user", userId, pushErr);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_created: notificationsCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking milestone deadlines:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
