import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "list_project_work_entries",
  title: "List project work entries",
  description:
    "List worker time entries for a project (scheduled vs actual hours, notes).",
  inputSchema: {
    project_id: z.string().describe("Project UUID."),
    limit: z.number().int().describe("Max entries. Defaults to 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const capped = Math.max(1, Math.min(200, Math.floor(limit ?? 50)));
    const { data, error } = await supabaseForUser(ctx)
      .from("project_work_entries")
      .select("id,worker_id,work_date,scheduled_hours,actual_hours,note,milestone_ids")
      .eq("project_id", project_id)
      .order("work_date", { ascending: false })
      .limit(capped);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { entries: data ?? [] },
    };
  },
});
