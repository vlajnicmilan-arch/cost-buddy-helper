import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "create_budget",
  title: "Create budget plan",
  description:
    "Create a new budget plan for the signed-in user. period_type is one of 'monthly', 'weekly', 'yearly', 'custom'.",
  inputSchema: {
    name: z.string().describe("Budget name, e.g. 'Kućni budžet listopad'."),
    total_amount: z.number().positive().describe("Total planned amount."),
    period_type: z.string().describe("'monthly' | 'weekly' | 'yearly' | 'custom'. Defaults to 'monthly'."),
    start_date: z.string().describe("ISO date YYYY-MM-DD. Optional."),
    end_date: z.string().describe("ISO date YYYY-MM-DD. Optional."),
    description: z.string().describe("Optional description."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const row = {
      user_id: ctx.getUserId(),
      name: input.name,
      total_amount: input.total_amount,
      period_type: input.period_type || "monthly",
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      description: input.description || null,
      is_active: true,
    };
    const { data, error } = await supabaseForUser(ctx)
      .from("budget_plans")
      .insert(row)
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created budget ${data.id}` }],
      structuredContent: { budget: data },
    };
  },
});
