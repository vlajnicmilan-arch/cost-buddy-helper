import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

      // Check if notification already sent today for this milestone
      const todayStr = today.toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("type", "milestone_deadline")
        .contains("data", { milestone_id: milestone.id })
        .gte("created_at", todayStr)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Get project managers (owner + managers)
      const { data: project } = await supabase
        .from("projects")
        .select("user_id, name")
        .eq("id", milestone.project_id)
        .single();

      if (!project) continue;

      const { data: managers } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", milestone.project_id)
        .eq("role", "manager");

      const userIds = new Set<string>([project.user_id]);
      managers?.forEach((m) => userIds.add(m.user_id));

      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isOverdue = daysUntilDue < 0;

      const title = isOverdue
        ? `⚠️ Faza "${milestone.name}" je istekla`
        : `⏰ Faza "${milestone.name}" ističe za ${daysUntilDue} dana`;

      const message = isOverdue
        ? `Faza "${milestone.name}" u projektu "${project.name}" je prošla rok za ${Math.abs(daysUntilDue)} dana.`
        : `Faza "${milestone.name}" u projektu "${project.name}" ističe ${new Date(milestone.due_date).toLocaleDateString("hr-HR")}.`;

      // Create notifications for all managers
      const notifications = Array.from(userIds).map((userId) => ({
        user_id: userId,
        type: "milestone_deadline",
        title,
        message,
        data: {
          milestone_id: milestone.id,
          project_id: milestone.project_id,
          due_date: milestone.due_date,
        },
      }));

      const { error: insertError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (!insertError) notificationsCreated += notifications.length;
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
