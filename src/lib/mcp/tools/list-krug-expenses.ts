import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "list_krug_expenses",
  title: "List krug expenses",
  description:
    "List recent expenses/incomes booked to any payment source shared with a given krug.",
  inputSchema: {
    krug_id: z.string().describe("Krug UUID."),
    limit: z.number().int().describe("Max rows. Defaults to 30."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ krug_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data: sources, error: srcErr } = await sb
      .from("krug_shared_payment_source")
      .select("payment_source_id")
      .eq("krug_id", krug_id);
    if (srcErr) return { content: [{ type: "text", text: srcErr.message }], isError: true };
    const srcIds = (sources ?? []).map((s) => s.payment_source_id);
    if (!srcIds.length) {
      return {
        content: [{ type: "text", text: "No shared sources in this krug." }],
        structuredContent: { rows: [] },
      };
    }
    const capped = Math.max(1, Math.min(200, Math.floor(limit ?? 30)));
    const { data, error } = await sb
      .from("expenses")
      .select("id,date,type,amount,currency,category,description,merchant_name,payment_source,user_id")
      .in("payment_source", srcIds)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(capped);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
