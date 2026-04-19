import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

      // Check if ANY budget alert was already sent for this budget in this period
      const { data: existingAlerts } = await supabase
        .from("notifications")
        .select("id, data")
        .eq("user_id", userId)
        .eq("type", "budget_alert")
        .gte("created_at", startDate.toISOString())
        .filter("data->>budget_id", "eq", budget.id);

      // Find the highest threshold already alerted
      const existingThresholds = (existingAlerts || []).map(
        (n: any) => Number(n.data?.threshold) || 0
      );
      const maxExistingThreshold = existingThresholds.length > 0
        ? Math.max(...existingThresholds)
        : 0;

      // Determine which threshold to alert (only the highest crossed, and only if new)
      const thresholds = [100, 90, 80]; // Check highest first
      let targetThreshold: number | null = null;

      for (const threshold of thresholds) {
        if (percentage >= threshold) {
          targetThreshold = threshold;
          break; // Found the highest crossed threshold
        }
      }

      if (!targetThreshold || targetThreshold <= maxExistingThreshold) {
        continue; // Already alerted at this or higher level
      }

      const alertKey = `budget_alert_${budget.id}_${targetThreshold}`;

      let title: string;
      let message: string;

      if (targetThreshold === 100) {
        title = `⚠️ Budžet "${budget.name}" prekoračen!`;
        message = `Potrošili ste ${percentage.toFixed(0)}% budžeta (${totalSpent.toFixed(2)} / ${totalLimit.toFixed(2)}).`;
      } else if (targetThreshold === 90) {
        title = `🔴 Budžet "${budget.name}" na 90%`;
        message = `Približavate se limitu! Potrošeno: ${totalSpent.toFixed(2)} od ${totalLimit.toFixed(2)}.`;
      } else {
        title = `🟡 Budžet "${budget.name}" na 80%`;
        message = `Pažljivo s potrošnjom. Preostalo vam je ${(totalLimit - totalSpent).toFixed(2)}.`;
      }

      const { error: notifError } = await supabase
        .from("notifications")
        .insert({
          user_id: userId,
          type: "budget_alert",
          title,
          message,
          data: {
            alert_key: alertKey,
            budget_id: budget.id,
            threshold: targetThreshold,
            percentage,
            spent: totalSpent,
            limit: totalLimit,
          },
        });

      if (notifError) {
        console.error("Error creating notification:", notifError);
      } else {
        // Best-effort push
        await sendPushNotification({
          user_id: userId,
          title,
          body: message,
          data: { budget_id: budget.id, threshold: targetThreshold, type: "budget_alert" },
        });

        alerts.push({
          budget_id: budget.id,
          budget_name: budget.name,
          threshold: targetThreshold,
          percentage,
          spent: totalSpent,
          limit: totalLimit,
        });
      }
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
