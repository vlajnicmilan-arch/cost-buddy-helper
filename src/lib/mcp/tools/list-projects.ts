import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "list_projects",
  title: "List projects",
  description:
    "List projects the signed-in user owns or is a member of, with total income/expense/profit derived from expenses.",
  inputSchema: {
    only_active: z.boolean().describe("If true, exclude archived. Defaults to true."),
    limit: z.number().int().describe("Max projects to return. Defaults to 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ only_active, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const capped = Math.max(1, Math.min(200, Math.floor(limit ?? 50)));
    let q = sb
      .from("projects")
      .select("id,name,description,status,project_type,total_budget,contract_value,start_date,end_date,archived_at,business_profile_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(capped);
    if (only_active !== false) q = q.is("archived_at", null);
    const { data: projects, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const ids = (projects ?? []).map((p) => p.id);
    let totals = new Map<string, { income: number; expense: number }>();
    if (ids.length) {
      const { data: exp } = await sb
        .from("expenses")
        .select("project_id,type,amount")
        .in("project_id", ids)
        .is("deleted_at", null);
      for (const e of exp ?? []) {
        const key = e.project_id as string;
        const cur = totals.get(key) ?? { income: 0, expense: 0 };
        if (e.type === "income") cur.income += Number(e.amount);
        else if (e.type === "expense") cur.expense += Number(e.amount);
        totals.set(key, cur);
      }
    }
    const enriched = (projects ?? []).map((p) => {
      const t = totals.get(p.id) ?? { income: 0, expense: 0 };
      return { ...p, total_income: t.income, total_expense: t.expense, profit: t.income - t.expense };
    });
    return {
      content: [{ type: "text", text: JSON.stringify(enriched) }],
      structuredContent: { projects: enriched },
    };
  },
});
