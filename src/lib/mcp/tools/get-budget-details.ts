import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "get_budget_details",
  title: "Get budget details",
  description:
    "For a given budget_id, return the plan, its categories with planned amounts, and actual spending (sum of expenses with matching budget_id).",
  inputSchema: {
    budget_id: z.string().describe("Budget plan UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ budget_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const [plan, categories, spent] = await Promise.all([
      sb.from("budget_plans").select("*").eq("id", budget_id).maybeSingle(),
      sb
        .from("budget_categories")
        .select("id,category,limit_amount,icon,color")
        .eq("budget_id", budget_id),
      sb
        .from("expenses")
        .select("category,amount,type")
        .eq("budget_id", budget_id)
        .is("deleted_at", null),
    ]);
    if (plan.error) return { content: [{ type: "text", text: plan.error.message }], isError: true };
    if (!plan.data) return { content: [{ type: "text", text: "Budget not found" }], isError: true };

    const spentByCat = new Map<string, number>();
    let totalSpent = 0;
    for (const e of spent.data ?? []) {
      if (e.type !== "expense") continue;
      const cur = spentByCat.get(e.category) ?? 0;
      spentByCat.set(e.category, cur + Number(e.amount));
      totalSpent += Number(e.amount);
    }
    const cats = (categories.data ?? []).map((c) => ({
      ...c,
      spent: spentByCat.get(c.category) ?? 0,
      remaining: Number(c.limit_amount) - (spentByCat.get(c.category) ?? 0),
    }));
    const result = {
      plan: plan.data,
      total_spent: totalSpent,
      total_remaining: Number(plan.data.total_amount) - totalSpent,
      categories: cats,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
