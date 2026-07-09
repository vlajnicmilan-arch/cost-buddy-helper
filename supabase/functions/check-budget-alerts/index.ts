import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";
import { translate } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TITLE_KEY = "notifications.budget_burn_push.title";
const MESSAGE_KEY = "notifications.budget_burn_push.message";
const PACE_TITLE_KEY = "notifications.budget_pace_push.title";
const PACE_MESSAGE_KEY = "notifications.budget_pace_push.message";

/** Mirror of src/lib/budgetPaceSignal.ts (Deno context cannot import from src/). */
const DAY_MS = 24 * 60 * 60 * 1000;
const PACE_THRESHOLD_PP = 20;
const PACE_MIN_ELAPSED_DAYS = 3;
function computePaceGap(spent: number, total: number, startMs: number, endMs: number, nowMs: number) {
  if (!(total > 0)) return null;
  const totalMs = endMs - startMs;
  if (!(totalMs > 0)) return null;
  if (nowMs < startMs || nowMs > endMs) return null;
  const elapsedMs = nowMs - startMs;
  const elapsedDays = elapsedMs / DAY_MS;
  const elapsedPct = (elapsedMs / totalMs) * 100;
  const spentPct = (spent / total) * 100;
  const gapPp = spentPct - elapsedPct;
  return { elapsedDays, elapsedPct, spentPct, gapPp };
}

interface BudgetAlert {
  budget_id: string;
  budget_name: string;
  threshold: number;
  percentage: number;
  spent: number;
  limit: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header to identify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's auth context for getClaims
    const userSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate JWT using getClaims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userSupabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("JWT validation error:", claimsError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const { category, amount, expense_date } = await req.json();

    // Get user's active budgets
    const { data: budgets, error: budgetsError } = await supabase
      .from("budget_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (budgetsError) {
      console.error("Error fetching budgets:", budgetsError);
      return new Response(JSON.stringify({ error: "Failed to fetch budgets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!budgets || budgets.length === 0) {
      return new Response(JSON.stringify({ alerts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alerts: BudgetAlert[] = [];
    const now = new Date();
    const expenseDate = expense_date ? new Date(expense_date) : now;

    for (const budget of budgets) {
      // Calculate date range based on period
      let startDate: Date;
      let endDate: Date;

      if (budget.period_type === "custom" && budget.start_date && budget.end_date) {
        startDate = new Date(budget.start_date);
        endDate = new Date(budget.end_date);
      } else if (budget.period_type === "weekly") {
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      } else if (budget.period_type === "yearly") {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      } else {
        // Monthly (default)
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }

      // Check if expense is within budget period
      if (expenseDate < startDate || expenseDate > endDate) {
        continue;
      }

      // Get total expenses for this budget period
      const { data: expenses, error: expensesError } = await supabase
        .from("expenses")
        .select("amount, category")
        .eq("budget_id", budget.id)
        .eq("type", "expense")
        .eq("status", "approved")
        .gte("date", startDate.toISOString())
        .lte("date", endDate.toISOString());

      if (expensesError) {
        console.error("Error fetching expenses:", expensesError);
        continue;
      }

      const totalSpent = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const totalLimit = Number(budget.total_amount);
      
      if (totalLimit <= 0) continue;

      const percentage = (totalSpent / totalLimit) * 100;

      // ── PACE SIGNAL (v1) ──────────────────────────────────────────────────
      // Independent of absolute 85/100% burn thresholds. Fires when spending is
      // ahead of the linear period pace by ≥20pp, but only from day 3 onwards
      // and only once per crossing (dedup: existing type='budget_pace' notification
      // in this period).
      const pace = computePaceGap(
        totalSpent,
        totalLimit,
        startDate.getTime(),
        endDate.getTime(),
        now.getTime(),
      );
      if (
        pace &&
        pace.elapsedDays >= PACE_MIN_ELAPSED_DAYS &&
        pace.gapPp >= PACE_THRESHOLD_PP
      ) {
        // Dedup within period
        const { data: existingPace } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "budget_pace")
          .gte("created_at", startDate.toISOString())
          .filter("data->>budget_id", "eq", budget.id)
          .limit(1);
        if (!existingPace || existingPace.length === 0) {
          const paceTitleVars = { name: budget.name };
          const paceMessageVars = {
            name: budget.name,
            spentPct: pace.spentPct.toFixed(0),
            elapsedPct: pace.elapsedPct.toFixed(0),
          };
          // In-app bell entry (dedup ledger + user-visible notification).
          await supabase.from("notifications").insert({
            user_id: userId,
            type: "budget_pace",
            title: translate("hr", PACE_TITLE_KEY, paceTitleVars),
            message: translate("hr", PACE_MESSAGE_KEY, paceMessageVars),
            data: {
              budget_id: budget.id,
              budget_name: budget.name,
              spent_pct: Math.round(pace.spentPct),
              elapsed_pct: Math.round(pace.elapsedPct),
              gap_pp: Math.round(pace.gapPp),
              type: "budget_pace",
              category: "budgets",
              route: `/budgets?id=${budget.id}`,
              fallback_route: "/budgets",
              highlight: { type: "budget", id: budget.id },
              i18n_title_key: PACE_TITLE_KEY,
              i18n_body_key: PACE_MESSAGE_KEY,
              title_vars: paceTitleVars,
              message_vars: paceMessageVars,
            },
          });
          // Push
          await sendPushNotification({
            user_id: userId,
            title: translate("hr", PACE_TITLE_KEY, paceTitleVars),
            body: translate("hr", PACE_MESSAGE_KEY, paceMessageVars),
            data: {
              budget_id: budget.id,
              type: "budget_pace",
              category: "budgets",
              i18n_title_key: PACE_TITLE_KEY,
              i18n_body_key: PACE_MESSAGE_KEY,
              title_vars: paceTitleVars,
              message_vars: paceMessageVars,
            },
            source: "check-budget-alerts",
          });
        }
      }

      // ── ABSOLUTE 100% BURN (push only; in-app owned by reconciler) ────────
      // Neutral copy — see notifications.budget_burn_push (updated to smjer language).
      if (percentage < 100) continue;


      // De-dupe push: only send once per budget per period, per threshold=100.
      // We reuse the notifications table as the dedup ledger via reconciler rows
      // (budget_burn auto-resolves), so check directly against budget_burn rows
      // already created for this budget in this period — if one exists with
      // spent_pct >= 100, the user already saw the in-app alert, so we just send
      // the push once (and avoid re-sending on every new expense).
      const { data: existingBurn } = await supabase
        .from("notifications")
        .select("id, data")
        .eq("user_id", userId)
        .eq("type", "budget_burn")
        .gte("created_at", startDate.toISOString())
        .filter("data->>budget_id", "eq", budget.id)
        .limit(5);

      const alreadyPushedAt100 = (existingBurn || []).some((n: any) => {
        const pct = Number(n.data?.spent_pct) || 0;
        const pushed = n.data?.push_sent_100 === true;
        return pct >= 100 && pushed;
      });

      if (alreadyPushedAt100) continue;

      const titleVars = { name: budget.name, percentage: percentage.toFixed(0) };
      const messageVars = {
        percentage: percentage.toFixed(0),
        spent: totalSpent.toFixed(2),
        limit: totalLimit.toFixed(2),
      };
      // HR fallback pre-rendered — send-push overrides with recipient's language.
      const title = translate("hr", TITLE_KEY, titleVars);
      const message = translate("hr", MESSAGE_KEY, messageVars);

      await sendPushNotification({
        user_id: userId,
        title,
        body: message,
        data: {
          budget_id: budget.id,
          threshold: 100,
          type: "budget_alert",
          category: "budgets",
          i18n_title_key: TITLE_KEY,
          i18n_body_key: MESSAGE_KEY,
          title_vars: titleVars,
          message_vars: messageVars,
        },
        source: "check-budget-alerts",
      });

      // Mark the latest budget_burn row (if any) so we don't push again.
      const latestBurn = (existingBurn || []).find((n: any) => Number(n.data?.spent_pct) >= 100);
      if (latestBurn?.id) {
        const newData = { ...(latestBurn.data || {}), push_sent_100: true };
        await supabase
          .from("notifications")
          .update({ data: newData })
          .eq("id", latestBurn.id);
      }

      alerts.push({
        budget_id: budget.id,
        budget_name: budget.name,
        threshold: 100,
        percentage,
        spent: totalSpent,
        limit: totalLimit,
      });
    }


    return new Response(JSON.stringify({ alerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("check-budget-alerts error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
