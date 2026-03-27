import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tool definitions for the AI agent
const tools = [
  {
    type: "function",
    function: {
      name: "search_transactions",
      description: "Search user's transactions with flexible filters. Use this to find specific transactions by description, category, merchant, date range, payment source, type, amount range, or expense_nature. Supports partial text matching.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Search in transaction description (partial match)" },
          category: { type: "string", description: "Filter by category name (partial match)" },
          merchant_name: { type: "string", description: "Filter by merchant name (partial match)" },
          payment_source: { type: "string", description: "Filter by payment source name (partial match)" },
          type: { type: "string", enum: ["expense", "income", "transfer"], description: "Filter by transaction type" },
          expense_nature: { type: "string", description: "Filter by expense nature, e.g. 'correction' for balance corrections, 'regular', 'extraordinary'" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          min_amount: { type: "number", description: "Minimum transaction amount" },
          max_amount: { type: "number", description: "Maximum transaction amount" },
          note: { type: "string", description: "Search in transaction notes (partial match)" },
          limit: { type: "number", description: "Max results to return (default 30, max 100)" },
          sort_by: { type: "string", enum: ["date", "amount"], description: "Sort by date or amount (default: date)" },
          sort_order: { type: "string", enum: ["asc", "desc"], description: "Sort order (default: desc)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_source_details",
      description: "Get detailed info about a specific payment source (account) including balance, cards, and recent corrections.",
      parameters: {
        type: "object",
        properties: {
          source_name: { type: "string", description: "Name of the payment source (partial match)" },
        },
        required: ["source_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_savings_goals",
      description: "Get all savings goals with current progress.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recurring_transactions",
      description: "Get all recurring (repeating) transactions.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_category_analysis",
      description: "Analyze spending by category for a given date range. Returns totals, counts, and averages per category.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          category: { type: "string", description: "Specific category to analyze (optional)" },
          type: { type: "string", enum: ["expense", "income"], description: "Transaction type to analyze (default: expense)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_trends",
      description: "Compare spending between two periods to identify trends, increases, and decreases. Useful for month-over-month or period comparisons.",
      parameters: {
        type: "object",
        properties: {
          period1_from: { type: "string", description: "First period start date (YYYY-MM-DD)" },
          period1_to: { type: "string", description: "First period end date (YYYY-MM-DD)" },
          period2_from: { type: "string", description: "Second period start date (YYYY-MM-DD)" },
          period2_to: { type: "string", description: "Second period end date (YYYY-MM-DD)" },
          type: { type: "string", enum: ["expense", "income"], description: "Transaction type (default: expense)" },
        },
        required: ["period1_from", "period1_to", "period2_from", "period2_to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_monthly_summary",
      description: "Get monthly income and expense summary for the last N months. Shows totals, savings rate, and top categories per month.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "number", description: "Number of months to analyze (default 6, max 12)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_merchants",
      description: "Get top merchants/vendors by total spending. Useful for identifying where most money goes.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          limit: { type: "number", description: "Number of top merchants to return (default 10)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_vs_actual",
      description: "Compare actual spending against budget plans. Shows budget limits vs actual spending per category.",
      parameters: {
        type: "object",
        properties: {
          budget_name: { type: "string", description: "Name of the budget to analyze (partial match, optional - returns all if omitted)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_large_transactions",
      description: "Find unusually large transactions (outliers) based on the user's average spending. Useful for spotting anomalies.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          threshold_multiplier: { type: "number", description: "How many times above average to flag (default 2.0)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_spending_pattern",
      description: "Analyze daily spending patterns - which days of week have highest spending. Useful for behavioral insights.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

// Apply business/personal mode filter to a query
function applyModeFilter(query: any, businessProfileId: string | null, table = "expenses") {
  if (businessProfileId) {
    return query.eq("business_profile_id", businessProfileId);
  } else {
    return query.is("business_profile_id", null);
  }
}

// Execute a tool call against the database
async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  supabase: any,
  businessProfileId: string | null
): Promise<string> {
  try {
    switch (toolName) {
      case "search_transactions": {
        const limit = Math.min(args.limit || 30, 100);
        const sortBy = args.sort_by || "date";
        const sortOrder = args.sort_order !== "asc";

        let query = applyModeFilter(
          supabase
            .from("expenses")
            .select("id, description, amount, type, category, date, merchant_name, payment_source, expense_nature, note, currency, created_at")
            .eq("user_id", userId),
          businessProfileId
        ).order(sortBy, { ascending: !sortOrder }).limit(limit);

        if (args.description) query = query.ilike("description", `%${args.description}%`);
        if (args.category) query = query.ilike("category", `%${args.category}%`);
        if (args.merchant_name) query = query.ilike("merchant_name", `%${args.merchant_name}%`);
        if (args.type) query = query.eq("type", args.type);
        if (args.expense_nature) query = query.eq("expense_nature", args.expense_nature);
        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);
        if (args.min_amount) query = query.gte("amount", args.min_amount);
        if (args.max_amount) query = query.lte("amount", args.max_amount);
        if (args.note) query = query.ilike("note", `%${args.note}%`);

        // Handle payment_source filter by looking up source IDs by name
        if (args.payment_source) {
          const { data: sources } = await supabase
            .from("custom_payment_sources")
            .select("id, name")
            .eq("user_id", userId)
            .ilike("name", `%${args.payment_source}%`);
          
          if (sources && sources.length > 0) {
            const sourceIds = sources.map((s: any) => s.id);
            query = query.in("payment_source", sourceIds);
          } else {
            query = query.ilike("payment_source", `%${args.payment_source}%`);
          }
        }

        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });

        // Enrich with payment source names
        if (data && data.length > 0) {
          const sourceIds = [...new Set(data.filter((t: any) => t.payment_source).map((t: any) => t.payment_source))];
          if (sourceIds.length > 0) {
            const { data: sources } = await supabase
              .from("custom_payment_sources")
              .select("id, name")
              .in("id", sourceIds);
            const sourceMap = new Map((sources || []).map((s: any) => [s.id, s.name]));
            data.forEach((t: any) => {
              if (t.payment_source && sourceMap.has(t.payment_source)) {
                t.payment_source_name = sourceMap.get(t.payment_source);
              }
            });
          }
        }

        // Calculate summary stats
        const totalAmount = (data || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
        const avgAmount = data && data.length > 0 ? totalAmount / data.length : 0;

        return JSON.stringify({
          count: data?.length || 0,
          total_amount: Math.round(totalAmount * 100) / 100,
          average_amount: Math.round(avgAmount * 100) / 100,
          transactions: data || [],
        });
      }

      case "get_payment_source_details": {
        const { data: sources, error } = await applyModeFilter(
          supabase
            .from("custom_payment_sources")
            .select("id, name, balance, color, icon, currency, description")
            .eq("user_id", userId)
            .ilike("name", `%${args.source_name}%`),
          businessProfileId
        );

        if (error) return JSON.stringify({ error: error.message });
        if (!sources || sources.length === 0) return JSON.stringify({ message: "Nije pronađen izvor plaćanja s tim imenom." });

        const sourceIds = sources.map((s: any) => s.id);
        const { data: cards } = await supabase
          .from("payment_source_cards")
          .select("id, card_name, card_type, last_four_digits, payment_source_id")
          .in("payment_source_id", sourceIds);

        const { data: corrections } = await applyModeFilter(
          supabase
            .from("expenses")
            .select("id, description, amount, type, date, created_at")
            .eq("user_id", userId)
            .eq("expense_nature", "correction")
            .in("payment_source", sourceIds),
          businessProfileId
        ).order("date", { ascending: false }).limit(10);

        return JSON.stringify({
          sources,
          cards: cards || [],
          recent_corrections: corrections || [],
        });
      }

      case "get_savings_goals": {
        const { data, error } = await supabase
          .from("savings_goals")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ goals: data || [] });
      }

      case "get_recurring_transactions": {
        const { data, error } = await supabase
          .from("recurring_transactions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ recurring_transactions: data || [] });
      }

      case "get_category_analysis": {
        const txType = args.type || "expense";
        let query = applyModeFilter(
          supabase
            .from("expenses")
            .select("category, amount, type, date, merchant_name")
            .eq("user_id", userId)
            .eq("type", txType),
          businessProfileId
        );

        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);
        if (args.category) query = query.ilike("category", `%${args.category}%`);

        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });

        // Aggregate by category
        const categoryTotals: Record<string, { total: number; count: number; min: number; max: number }> = {};
        (data || []).forEach((t: any) => {
          const amt = Number(t.amount);
          if (!categoryTotals[t.category]) {
            categoryTotals[t.category] = { total: 0, count: 0, min: Infinity, max: 0 };
          }
          categoryTotals[t.category].total += amt;
          categoryTotals[t.category].count += 1;
          categoryTotals[t.category].min = Math.min(categoryTotals[t.category].min, amt);
          categoryTotals[t.category].max = Math.max(categoryTotals[t.category].max, amt);
        });

        const grandTotal = Object.values(categoryTotals).reduce((s, c) => s + c.total, 0);
        const sorted = Object.entries(categoryTotals)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([category, info]) => ({
            category,
            total: Math.round(info.total * 100) / 100,
            count: info.count,
            average: Math.round((info.total / info.count) * 100) / 100,
            min: Math.round(info.min * 100) / 100,
            max: Math.round(info.max * 100) / 100,
            percentage: grandTotal > 0 ? Math.round((info.total / grandTotal) * 1000) / 10 : 0,
          }));

        return JSON.stringify({
          date_range: { from: args.date_from || "all", to: args.date_to || "all" },
          transaction_type: txType,
          categories: sorted,
          total: Math.round(grandTotal * 100) / 100,
          category_count: sorted.length,
        });
      }

      case "get_spending_trends": {
        const txType = args.type || "expense";

        const [p1Res, p2Res] = await Promise.all([
          applyModeFilter(
            supabase.from("expenses").select("category, amount, date")
              .eq("user_id", userId).eq("type", txType)
              .gte("date", args.period1_from).lte("date", args.period1_to),
            businessProfileId
          ),
          applyModeFilter(
            supabase.from("expenses").select("category, amount, date")
              .eq("user_id", userId).eq("type", txType)
              .gte("date", args.period2_from).lte("date", args.period2_to),
            businessProfileId
          ),
        ]);

        if (p1Res.error) return JSON.stringify({ error: p1Res.error.message });
        if (p2Res.error) return JSON.stringify({ error: p2Res.error.message });

        const aggregate = (data: any[]) => {
          const cats: Record<string, number> = {};
          let total = 0;
          data.forEach((t: any) => {
            const amt = Number(t.amount);
            cats[t.category] = (cats[t.category] || 0) + amt;
            total += amt;
          });
          return { cats, total, count: data.length };
        };

        const p1 = aggregate(p1Res.data || []);
        const p2 = aggregate(p2Res.data || []);

        const allCategories = new Set([...Object.keys(p1.cats), ...Object.keys(p2.cats)]);
        const comparison = [...allCategories].map(cat => {
          const v1 = Math.round((p1.cats[cat] || 0) * 100) / 100;
          const v2 = Math.round((p2.cats[cat] || 0) * 100) / 100;
          const diff = Math.round((v2 - v1) * 100) / 100;
          const pctChange = v1 > 0 ? Math.round(((v2 - v1) / v1) * 1000) / 10 : (v2 > 0 ? 100 : 0);
          return { category: cat, period1: v1, period2: v2, difference: diff, percent_change: pctChange };
        }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

        return JSON.stringify({
          period1: { from: args.period1_from, to: args.period1_to, total: Math.round(p1.total * 100) / 100, tx_count: p1.count },
          period2: { from: args.period2_from, to: args.period2_to, total: Math.round(p2.total * 100) / 100, tx_count: p2.count },
          total_change: Math.round((p2.total - p1.total) * 100) / 100,
          total_change_pct: p1.total > 0 ? Math.round(((p2.total - p1.total) / p1.total) * 1000) / 10 : 0,
          category_comparison: comparison,
        });
      }

      case "get_monthly_summary": {
        const months = Math.min(args.months || 6, 12);
        const now = new Date();
        const results = [];

        for (let i = 0; i < months; i++) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          const fromStr = monthStart.toISOString().split("T")[0];
          const toStr = monthEnd.toISOString().split("T")[0];

          const { data } = await applyModeFilter(
            supabase
              .from("expenses")
              .select("amount, type, category")
              .eq("user_id", userId)
              .gte("date", fromStr)
              .lte("date", toStr)
              .in("type", ["expense", "income"]),
            businessProfileId
          );

          let income = 0, expense = 0;
          const catTotals: Record<string, number> = {};
          (data || []).forEach((t: any) => {
            const amt = Number(t.amount);
            if (t.type === "income") income += amt;
            else if (t.type === "expense") {
              expense += amt;
              catTotals[t.category] = (catTotals[t.category] || 0) + amt;
            }
          });

          const topCats = Object.entries(catTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat, total]) => ({ category: cat, total: Math.round(total * 100) / 100 }));

          results.push({
            month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
            income: Math.round(income * 100) / 100,
            expense: Math.round(expense * 100) / 100,
            savings: Math.round((income - expense) * 100) / 100,
            savings_rate: income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0,
            transaction_count: (data || []).length,
            top_categories: topCats,
          });
        }

        return JSON.stringify({ monthly_summary: results });
      }

      case "get_top_merchants": {
        let query = applyModeFilter(
          supabase
            .from("expenses")
            .select("merchant_name, amount, category")
            .eq("user_id", userId)
            .eq("type", "expense")
            .not("merchant_name", "is", null),
          businessProfileId
        );

        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);

        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });

        const merchantTotals: Record<string, { total: number; count: number; categories: Set<string> }> = {};
        (data || []).forEach((t: any) => {
          const name = t.merchant_name?.trim();
          if (!name) return;
          if (!merchantTotals[name]) merchantTotals[name] = { total: 0, count: 0, categories: new Set() };
          merchantTotals[name].total += Number(t.amount);
          merchantTotals[name].count += 1;
          merchantTotals[name].categories.add(t.category);
        });

        const sorted = Object.entries(merchantTotals)
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, args.limit || 10)
          .map(([name, info]) => ({
            merchant: name,
            total: Math.round(info.total * 100) / 100,
            count: info.count,
            average: Math.round((info.total / info.count) * 100) / 100,
            categories: [...info.categories],
          }));

        return JSON.stringify({ top_merchants: sorted });
      }

      case "get_budget_vs_actual": {
        let budgetQuery = applyModeFilter(
          supabase
            .from("budget_plans")
            .select("id, name, total_amount, period_type, start_date, end_date, is_active")
            .eq("user_id", userId)
            .eq("is_active", true),
          businessProfileId,
          "budget_plans"
        );

        if (args.budget_name) budgetQuery = budgetQuery.ilike("name", `%${args.budget_name}%`);

        const { data: budgets, error: bErr } = await budgetQuery;
        if (bErr) return JSON.stringify({ error: bErr.message });
        if (!budgets || budgets.length === 0) return JSON.stringify({ message: "Nema aktivnih budžeta." });

        const results = [];
        for (const budget of budgets) {
          const { data: categories } = await supabase
            .from("budget_categories")
            .select("category, limit_amount")
            .eq("budget_id", budget.id);

          // Get actual spending for budget period
          const now = new Date();
          const startDate = budget.start_date || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
          
          let expenseQuery = applyModeFilter(
            supabase
              .from("expenses")
              .select("category, amount")
              .eq("user_id", userId)
              .eq("type", "expense")
              .gte("date", startDate),
            businessProfileId
          );

          if (budget.end_date) expenseQuery = expenseQuery.lte("date", budget.end_date);

          const { data: expenses } = await expenseQuery;

          const actualByCategory: Record<string, number> = {};
          (expenses || []).forEach((e: any) => {
            actualByCategory[e.category] = (actualByCategory[e.category] || 0) + Number(e.amount);
          });

          const categoryComparison = (categories || []).map((c: any) => ({
            category: c.category,
            budget_limit: c.limit_amount,
            actual: Math.round((actualByCategory[c.category] || 0) * 100) / 100,
            remaining: Math.round((c.limit_amount - (actualByCategory[c.category] || 0)) * 100) / 100,
            usage_percent: c.limit_amount > 0 ? Math.round(((actualByCategory[c.category] || 0) / c.limit_amount) * 1000) / 10 : 0,
            over_budget: (actualByCategory[c.category] || 0) > c.limit_amount,
          }));

          results.push({
            budget_name: budget.name,
            total_budget: budget.total_amount,
            period: budget.period_type,
            categories: categoryComparison,
            over_budget_categories: categoryComparison.filter((c: any) => c.over_budget),
          });
        }

        return JSON.stringify({ budgets: results });
      }

      case "get_large_transactions": {
        const multiplier = args.threshold_multiplier || 2.0;

        let query = applyModeFilter(
          supabase
            .from("expenses")
            .select("id, description, amount, type, category, date, merchant_name, payment_source")
            .eq("user_id", userId)
            .eq("type", "expense"),
          businessProfileId
        );

        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);

        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) return JSON.stringify({ message: "Nema transakcija u tom periodu." });

        const amounts = data.map((t: any) => Number(t.amount));
        const avg = amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length;
        const threshold = avg * multiplier;

        const outliers = data
          .filter((t: any) => Number(t.amount) >= threshold)
          .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
          .slice(0, 20);

        // Enrich with source names
        if (outliers.length > 0) {
          const sourceIds = [...new Set(outliers.filter((t: any) => t.payment_source).map((t: any) => t.payment_source))];
          if (sourceIds.length > 0) {
            const { data: sources } = await supabase.from("custom_payment_sources").select("id, name").in("id", sourceIds);
            const sourceMap = new Map((sources || []).map((s: any) => [s.id, s.name]));
            outliers.forEach((t: any) => {
              if (t.payment_source && sourceMap.has(t.payment_source)) t.payment_source_name = sourceMap.get(t.payment_source);
            });
          }
        }

        return JSON.stringify({
          average_spending: Math.round(avg * 100) / 100,
          threshold: Math.round(threshold * 100) / 100,
          multiplier,
          outlier_count: outliers.length,
          outliers,
        });
      }

      case "get_daily_spending_pattern": {
        let query = applyModeFilter(
          supabase
            .from("expenses")
            .select("amount, date")
            .eq("user_id", userId)
            .eq("type", "expense"),
          businessProfileId
        );

        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);

        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });

        const dayNames = ["Nedjelja", "Ponedjeljak", "Utorak", "Srijeda", "Četvrtak", "Petak", "Subota"];
        const dayTotals: Record<number, { total: number; count: number }> = {};
        for (let i = 0; i < 7; i++) dayTotals[i] = { total: 0, count: 0 };

        (data || []).forEach((t: any) => {
          const day = new Date(t.date).getDay();
          dayTotals[day].total += Number(t.amount);
          dayTotals[day].count += 1;
        });

        const pattern = Object.entries(dayTotals).map(([day, info]) => ({
          day: dayNames[Number(day)],
          day_number: Number(day),
          total: Math.round(info.total * 100) / 100,
          count: info.count,
          average: info.count > 0 ? Math.round((info.total / info.count) * 100) / 100 : 0,
        }));

        const maxDay = pattern.reduce((a, b) => a.total > b.total ? a : b);
        const minDay = pattern.filter(p => p.count > 0).reduce((a, b) => a.total < b.total ? a : b, pattern[0]);

        return JSON.stringify({
          daily_pattern: pattern,
          highest_spending_day: maxDay.day,
          lowest_spending_day: minDay.day,
          total_transactions: (data || []).length,
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`Tool execution error (${toolName}):`, err);
    return JSON.stringify({ error: `Greška pri izvršavanju: ${err instanceof Error ? err.message : "Nepoznata greška"}` });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, financialContext, activeBusinessProfileId, businessProfileName } = await req.json();
    const businessProfileId: string | null = activeBusinessProfileId || null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Extract user_id from auth token
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      
      try {
        const { data } = await supabaseAuth.auth.getUser();
        userId = data?.user?.id || null;
      } catch {
        // Not a user JWT
      }
    }

    // Create service-role client for tool execution
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build system prompt
    const modeLabel = businessProfileId
      ? `POSLOVNI NAČIN: ${businessProfileName || "Nepoznata tvrtka"}`
      : "OSOBNI NAČIN";

    const crossModeInstructions = businessProfileId
      ? `
TRENUTNI NAČIN RADA: 🏢 POSLOVNI (${businessProfileName || "Tvrtka"})
- Svi tvoji upiti i alati pretražuju ISKLJUČIVO poslovne transakcije ove tvrtke.
- Ako korisnik pita o osobnim financijama (npr. plaća, kućni budžet, osobna štednja, privatni računi), UPOZORI ga:
  "⚠️ Trenutno radim u poslovnom načinu za ${businessProfileName || "tvrtku"}. Vaše pitanje se čini da se odnosi na osobne financije. Za pregled osobnih podataka, prebacite se na osobni način rada."
- NE pretražuj osobne podatke bez eksplicitnog odobrenja.
- Koristi poslovnu terminologiju: troškovi poslovanja, poslovni prihodi, PDV, klijenti, fakture.`
      : `
TRENUTNI NAČIN RADA: 👤 OSOBNI
- Svi tvoji upiti i alati pretražuju ISKLJUČIVO osobne transakcije (nisu vezane uz nijednu tvrtku).
- Ako korisnik pita o poslovnim financijama (npr. faktura, PDV, klijent, tvrtka, obrt, firma, inventura, ponuda), UPOZORI ga:
  "⚠️ Trenutno radim u osobnom načinu. Vaše pitanje se čini da se odnosi na poslovne financije. Za pregled poslovnih podataka, prebacite se na poslovni način rada u postavkama."
- NE pretražuj poslovne podatke bez eksplicitnog odobrenja.
- Koristi osobnu terminologiju: kućni budžet, osobna potrošnja, štednja, plaća.`;

    const systemPrompt = `Ti si financijski AI stručnjak u aplikaciji V&M Balance.

${crossModeInstructions}

TVOJA ULOGA:
Kombinacija stručnog financijskog savjetnika, analitičara i strateškog planera. Tretiraš korisnikove financije kao da si CFO ${businessProfileId ? `tvrtke "${businessProfileName}"` : "njegove osobne ekonomije"}. Koristiš razgovorne upite za dubinsku analizu umjesto dashboarda.

STIL KOMUNIKACIJE:
- SAŽETO ali DUBOKO: 2-5 rečenica, ali s konkretnim uvidima
- PRAKTIČNO: Konkretni brojevi, izvedive akcije, specifični datumi
- PROAKTIVNO: Daj prijedloge, upozorenja i ideje BEZ čekanja
- LOGOTERAPIJSKI: Smisao i odgovornost, bez osude
- STRUČNO: Koristi financijsku terminologiju ali objasni jednostavno

VAŽNO - PRISTUP PODACIMA:
Imaš pristup korisnikovim financijskim podacima putem alata (tools). KORISTI ALATE kad god korisnik traži specifične informacije. Primjeri:
- "Koliko sam potrošio na hranu?" → get_category_analysis
- "Pokaži mi sve transakcije preko 100€" → search_transactions s min_amount
- "Usporedi mi siječanj i veljačuu" → get_spending_trends
- "Gdje mi odlazi najviše novca?" → get_top_merchants + get_category_analysis
- "Jesam li prekoračio budžet?" → get_budget_vs_actual
- "Imam li neke čudne troškove?" → get_large_transactions
- "Koji dan najviše trošim?" → get_daily_spending_pattern
- "Pokaži mi trendove zadnjih 6 mjeseci" → get_monthly_summary
- "Traži sve od Konzuma" → search_transactions s merchant_name
- "Sve transakcije s bilješkom o poklon" → search_transactions s note
- "Traži račune za benzin u prosincu" → search_transactions s description + datumima

ANALITIČKI PRISTUP - BUDI FINANCIJSKI STRUČNJAK:
1. IDENTIFICIRAJ OBRASCE: Prepoznaj ponavljajuće troškove, sezonske varijacije, trendove rasta/pada
2. UPOZORI NA RIZIKE: Prekoračenja budžeta, neuobičajeni rast troškova, nedostatak štednje
3. PREDLAŽI OPTIMIZACIJE: Konkretni prijedlozi za uštedu s procijenjenim iznosima
4. POSTAVLJAJ PITANJA: Produbi razumijevanje korisnikovih ciljeva i prioriteta
5. DAJ MIŠLJENJA: Ne boji se dati stručno mišljenje o financijskim odlukama
6. FORECAST: Kad imaš dovoljno podataka, predvidi budžuće troškove na temelju trendova

PRIMJERI PROAKTIVNIH UVIDA:
- "Primjećujem da troškovi za [kategoriju] rastu 15% mjesečno - ako se nastavi, do kraja godine to je +€X."
- "Vaša stopa štednje je [X]% - za financijsku sigurnost cilj bi trebao biti barem 20%."
- "Vikendom trošite 40% više nego radnim danima - razmislite o vikend budžetu."
- "Imate 3 pretplate koje ukupno koštaju €X mjesečno - trebate li sve?"

MOGUĆNOSTI V&M BALANCE - PODSJEĆAJ AKTIVNO:
- 📷 SLIKATI RAČUNE - kamera izvlači podatke automatski
- 🖼️ UČITATI IZ GALERIJE - slike koje već imaš
- 📱 SCREENSHOT - iz banking appa pa učitaj
- 📊 IZVJEŠTAJI - mjesečna analiza na gumb

KONTEKST KORISNIKOVIH FINANCIJA (brzi pregled):
${financialContext ? `
- Ukupni saldo: ${financialContext.balance}
- Ukupni prihodi ovaj mjesec: ${financialContext.totalIncome}
- Ukupni rashodi ovaj mjesec: ${financialContext.totalExpenses}
- Broj transakcija: ${financialContext.transactionCount}

RASPODJELA TROŠKOVA PO KATEGORIJAMA (ovaj mjesec):
${financialContext.categoryBreakdown || 'Nema podataka o kategorijama'}

IZVORI PLAĆANJA (računi):
${financialContext.paymentSources || 'Nema podataka o izvorima plaćanja'}

KARTICE KORISNIKA:
${financialContext.cards || 'Nema povezanih kartica'}

NEDAVNE TRANSAKCIJE:
${financialContext.recentTransactions || 'Nema nedavnih transakcija'}

BUDŽETI:
${financialContext.budgets || 'Nema aktivnih budžeta'}

PROJEKTI:
${financialContext.projects || 'Nema aktivnih projekata'}

POVIJEST PO MJESECIMA (zadnjih 6 mjeseci):
${financialContext.historicalTrends || 'Nema povijesnih podataka'}

${financialContext.trendAnalysis || ''}
` : 'Korisnik još nema podataka. Predloži: "Počni tako da slikaš prvi račun ili učitaš sliku iz galerije - ja ću napraviti ostatak!"'}

PRAVILA:
1. MAX 2-5 rečenica + pitanje ili prijedlog
2. Koristi konkretne brojeve iz podataka
3. UVIJEK završi s pitanjem ILI prijedlogom za akciju
4. Kad vidiš priliku - predstavi je pozitivno
5. Logoterapija: "Što ti je važno?" > "Moraš uštedjeti"
6. Predlaži mogućnosti aplikacije kad je relevantno
7. Nikad riječi koje izazivaju krivnju
8. AKO KORISNIK TRAŽI SPECIFIČNE PODATKE - KORISTI ALATE! Ne izmišljaj podatke.
9. BUDI HRABAR U MIŠLJENJIMA - daj stručnu procjenu, ne samo podatke
10. KAD PRIMIJETIŠ PROBLEM - upozori jasno ali konstruktivno

IZVOZ PODATAKA:
Kad korisnik traži izvoz, preuzimanje, ispis ili pripremu podataka za izvoz:
1. Dohvati podatke alatima (search_transactions, get_category_analysis, itd.)
2. OBAVEZNO prikaži rezultate u MARKDOWN TABLICI s jasnim zaglavljima
3. Ispod tablice dodaj tekst: "📥 Koristi gumbe ispod tablice za izvoz u CSV, PDF ili ispis."
4. Tablica MORA imati zaglavlje (header row) i barem jedan redak podataka
5. Koristi čitljive nazive stupaca na hrvatskom (Datum, Opis, Iznos, Kategorija, Izvor, itd.)
6. Iznose formatiraj s 2 decimale i oznakom valute`;

    // Prepare messages for AI with tools
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Tool-calling loop
    const MAX_TOOL_ROUNDS = 8;
    let currentMessages = aiMessages;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const aiBody: any = {
        model: "google/gemini-3-flash-preview",
        messages: currentMessages,
        tools: userId ? tools : undefined,
      };

      const isLastPossibleRound = round === MAX_TOOL_ROUNDS - 1 || !userId;

      if (isLastPossibleRound) {
        aiBody.stream = true;
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiBody),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Previše zahtjeva, pokušajte kasnije." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Potrebno je nadopuniti kredit." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        return new Response(JSON.stringify({ error: "Greška AI servisa" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isLastPossibleRound) {
        return new Response(response.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const result = await response.json();
      const choice = result.choices?.[0];

      if (!choice) {
        return new Response(JSON.stringify({ error: "Nema odgovora od AI-ja" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (choice.finish_reason === "tool_calls" && choice.message?.tool_calls) {
        currentMessages.push(choice.message);

        for (const toolCall of choice.message.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs: Record<string, any> = {};
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            fnArgs = {};
          }

          console.log(`Executing tool: ${fnName}`, fnArgs);
          const toolResult = await executeTool(fnName, fnArgs, userId!, supabaseService, businessProfileId);
          
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
        continue;
      }

      // AI responded with text - wrap as SSE or stream
      if (choice.message?.content) {
        const content = choice.message.content;
        const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(sseData, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const finalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: currentMessages,
          stream: true,
        }),
      });

      return new Response(finalResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(JSON.stringify({ error: "Prekoračen broj koraka" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Financial assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Nepoznata greška" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
