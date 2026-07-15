import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_recent_expenses",
  title: "List recent transactions",
  description:
    "List the signed-in user's most recent transactions (expenses, income, transfers) from Centar, newest first.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .describe("How many rows to return (1-50). Defaults to 20."),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated" }],
        isError: true,
      };
    }
    const capped = Math.max(1, Math.min(50, Math.floor(limit ?? 20)));
    const { data, error } = await supabaseForUser(ctx)
      .from("expenses")
      .select(
        "id,date,event_at,type,amount,currency,category,description,merchant_name,payment_source",
      )
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(capped);

    if (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
