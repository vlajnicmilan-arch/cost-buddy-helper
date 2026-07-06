import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "list_budgets",
  title: "List budgets",
  description:
    "List the signed-in user's budget plans (name, total amount, period, active flag).",
  inputSchema: {
    only_active: z
      .boolean()
      .describe("If true, only active budgets. Defaults to true."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ only_active }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("budget_plans")
      .select(
        "id,name,description,total_amount,period_type,start_date,end_date,is_active,project_id,created_at",
      )
      .order("created_at", { ascending: false });
    if (only_active !== false) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { budgets: data ?? [] },
    };
  },
});
