import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "get_krug_summary",
  title: "Get krug summary",
  description:
    "For a krug_id return its members, shared payment sources, and total expenses on those shared sources in the last 30 days.",
  inputSchema: {
    krug_id: z.string().describe("Krug UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ krug_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const [krug, members, sources] = await Promise.all([
      sb.from("krug").select("id,name,preset,lifecycle_state,created_at").eq("id", krug_id).maybeSingle(),
      sb.from("krug_membership").select("user_id,role,created_at").eq("krug_id", krug_id),
      sb.from("krug_shared_payment_source").select("payment_source_id,linked_by,linked_at").eq("krug_id", krug_id),
    ]);
    if (krug.error) return { content: [{ type: "text", text: krug.error.message }], isError: true };
    if (!krug.data) return { content: [{ type: "text", text: "Krug not found" }], isError: true };

    const srcIds = (sources.data ?? []).map((s) => s.payment_source_id);
    let recent_expense_total = 0;
    if (srcIds.length) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: exp } = await sb
        .from("expenses")
        .select("amount,type")
        .in("payment_source", srcIds)
        .gte("date", since)
        .is("deleted_at", null);
      for (const e of exp ?? []) if (e.type === "expense") recent_expense_total += Number(e.amount);
    }
    const result = {
      krug: krug.data,
      members: members.data ?? [],
      shared_sources: sources.data ?? [],
      recent_expense_total_30d: recent_expense_total,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
