import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "add_budget_category",
  title: "Add category to budget",
  description:
    "Add a category with a planned limit to an existing budget plan.",
  inputSchema: {
    budget_id: z.string().describe("Target budget plan UUID."),
    category: z.string().describe("Category name, e.g. 'groceries'."),
    limit_amount: z.number().positive().describe("Planned limit for this category."),
    icon: z.string().describe("Optional emoji/icon."),
    color: z.string().describe("Optional hex color, e.g. '#3b82f6'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("budget_categories")
      .insert({
        budget_id: input.budget_id,
        category: input.category,
        limit_amount: input.limit_amount,
        icon: input.icon || null,
        color: input.color || null,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Added category ${data.id}` }],
      structuredContent: { category: data },
    };
  },
});
