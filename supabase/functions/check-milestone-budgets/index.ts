import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { translate } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Daily cron job: detect milestones whose `spent` exceeds 80% or 100% of their `budget`,
 * notify owners + project managers (in-app + push), and record the alert in
 * `milestone_budget_alerts` to prevent re-sending the same threshold.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Pull all milestones with a positive budget that are not completed.
    const { data: milestones, error: mError } = await supabase
      .from("project_milestones")
      .select("id, project_id, name, budget, status, is_contingency")
      .gt("budget", 0)
      .neq("status", "completed");

    if (mError) throw mError;

    let alertsCreated = 0;
    let pushSent = 0;

    for (const m of milestones || []) {
      // Skip the contingency reserve phase — it's not a real overrun signal.
      if (m.is_contingency) continue;

      const budget = Number(m.budget) || 0;
      if (budget <= 0) continue;

      // Compute "spent" for this milestone from `expenses` (mirrors the app's logic):
      // only `type='expense'`, exclude transfers and balance corrections.
      const { data: spentRows, error: spentErr } = await supabase
        .from("expenses")
        .select("amount, expense_nature")
        .eq("milestone_id", m.id)
        .eq("type", "expense");
      if (spentErr) {
        console.warn("Failed to compute spent for milestone", m.id, spentErr);
        continue;
      }
      const spent = (spentRows || [])
        .filter((r: any) => r.expense_nature !== "transfer" && r.expense_nature !== "correction")
        .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

      const usagePct = (spent / budget) * 100;
      // Pick the highest threshold reached (100 wins over 80).
      let threshold: 80 | 100 | null = null;
      if (usagePct >= 100) threshold = 100;
      else if (usagePct >= 80) threshold = 80;
      if (!threshold) continue;

      // Resolve recipients: project owner + every project manager.
      const { data: project } = await supabase
        .from("projects")
        .select("user_id, name")
        .eq("id", m.project_id)
        .single();
      if (!project) continue;

      // Recipients: project owner only (manager role removed in F8–F10 realign).
      const userIds = new Set<string>([project.user_id]);

      // Anti-spam: skip recipients who already received this threshold for this milestone.
      const { data: alreadySent } = await supabase
        .from("milestone_budget_alerts")
        .select("user_id")
        .eq("milestone_id", m.id)
        .eq("threshold", threshold);
      const sentUserIds = new Set((alreadySent || []).map((r) => r.user_id));

      const targets = Array.from(userIds).filter((uid) => !sentUserIds.has(uid));
      if (targets.length === 0) continue;

      const isOver = threshold === 100;
      const overPct = usagePct - 100;
      const percentageRounded = Math.round(usagePct);

      const titleKey = isOver
        ? "notifications.milestone_budget.over.title"
        : "notifications.milestone_budget.warning.title";
      const messageKey = isOver
        ? "notifications.milestone_budget.over.message"
        : "notifications.milestone_budget.warning.message";

      const titleVars = isOver
        ? { name: m.name }
        : { name: m.name, percentage: percentageRounded };
      const messageVars = isOver
        ? { name: m.name, project: project.name, overPct: overPct.toFixed(0) }
        : { name: m.name, project: project.name, percentage: percentageRounded };

      const fallbackTitle = translate("hr", titleKey, titleVars);
      const fallbackMessage = translate("hr", messageKey, messageVars);

      // 1) In-app notifications — store i18n keys so client renders per user language.
      const notifications = targets.map((userId) => ({
        user_id: userId,
        type: "milestone_budget_alert",
        title: titleKey,
        message: messageKey,
        data: {
          milestone_id: m.id,
          project_id: m.project_id,
          threshold,
          usage_pct: Number(usagePct.toFixed(2)),
          title_vars: titleVars,
          message_vars: messageVars,
        },
      }));

      const { error: insertNotifErr } = await supabase
        .from("notifications")
        .insert(notifications);
      if (insertNotifErr) {
        console.warn("Failed to insert notifications", insertNotifErr);
        continue;
      }

      // 2) Anti-spam log
      const alertRows = targets.map((userId) => ({
        milestone_id: m.id,
        project_id: m.project_id,
        user_id: userId,
        threshold,
        usage_pct: Number(usagePct.toFixed(2)),
      }));
      const { error: alertErr } = await supabase
        .from("milestone_budget_alerts")
        .insert(alertRows);
      if (!alertErr) alertsCreated += alertRows.length;

      // 3) Push notifications (best effort) — send-push translates via i18n keys.
      for (const userId of targets) {
        try {
          await supabase.functions.invoke("send-push", {
            body: {
              user_id: userId,
              title: fallbackTitle,
              body: fallbackMessage,
              data: {
                type: "milestone_budget_alert",
                milestone_id: m.id,
                project_id: m.project_id,
                threshold: String(threshold),
                category: "budgets",
                i18n_title_key: titleKey,
                i18n_body_key: messageKey,
                title_vars: titleVars,
                message_vars: messageVars,
              },
            },
          });
          pushSent += 1;
        } catch (pushErr) {
          console.warn("Push send failed for user", userId, pushErr);
        }
      }

      // Daily digest enqueue (po prostoru, recipient-type independent).
      // Actor = project owner (system signal) — owner is excluded; participants
      // and members get a consolidated daily summary instead of an instant push.
      try {
        await supabase.rpc("enqueue_participant_digest_event", {
          p_project_id: m.project_id,
          p_actor_user_id: project.user_id,
          p_event: {
            kind: threshold === 100
              ? "milestone_budget_over"
              : "milestone_budget_warning",
            label: m.name ?? null,
            ref_id: m.id ?? null,
            threshold,
            usage_pct: Number(usagePct.toFixed(2)),
            at: new Date().toISOString(),
          },
        });
      } catch (digestErr) {
        console.error("[check-milestone-budgets] digest enqueue error", digestErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alerts_created: alertsCreated,
        push_sent: pushSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-milestone-budgets error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
