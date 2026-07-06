import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "list_krugs",
  title: "List krugs (shared circles)",
  description:
    "List krugs (shared/family circles) the signed-in user is a member of, with their role in each.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data: memberships, error } = await sb
      .from("krug_membership")
      .select("krug_id,role,krug:krug_id(id,name,preset,lifecycle_state,created_at)")
      .eq("user_id", ctx.getUserId());
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (memberships ?? []).map((m: any) => ({
      krug_id: m.krug_id,
      role: m.role,
      ...(m.krug ?? {}),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { krugs: rows },
    };
  },
});
