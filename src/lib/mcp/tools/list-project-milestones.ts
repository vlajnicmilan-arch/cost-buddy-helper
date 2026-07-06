import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "list_project_milestones",
  title: "List project milestones",
  description:
    "List milestones for a project with planned and actual dates plus a delay flag if the actual end passed the due date.",
  inputSchema: {
    project_id: z.string().describe("Project UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("project_milestones")
      .select("id,name,status,budget,start_date,due_date,actual_start_date,actual_end_date,completed_at,sort_order")
      .eq("project_id", project_id)
      .is("deleted_at", null)
      .order("sort_order");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const enriched = (data ?? []).map((m) => {
      const end = m.actual_end_date || (m.completed_at ? String(m.completed_at).slice(0, 10) : null);
      const delayed = end && m.due_date ? end > m.due_date : false;
      return { ...m, is_delayed: delayed };
    });
    return {
      content: [{ type: "text", text: JSON.stringify(enriched) }],
      structuredContent: { milestones: enriched },
    };
  },
});
