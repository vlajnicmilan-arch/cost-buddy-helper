import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "get_project_details",
  title: "Get project details",
  description:
    "Return a project with its milestones, team members, and aggregated income/expense totals.",
  inputSchema: {
    project_id: z.string().describe("Project UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const [project, milestones, members, expenses] = await Promise.all([
      sb.from("projects").select("*").eq("id", project_id).is("deleted_at", null).maybeSingle(),
      sb.from("project_milestones").select("id,name,status,budget,start_date,due_date,actual_start_date,actual_end_date,completed_at").eq("project_id", project_id).is("deleted_at", null).order("sort_order"),
      sb.from("project_members").select("*").eq("project_id", project_id),
      sb.from("expenses").select("type,amount").eq("project_id", project_id).is("deleted_at", null),
    ]);
    if (project.error) return { content: [{ type: "text", text: project.error.message }], isError: true };
    if (!project.data) return { content: [{ type: "text", text: "Project not found" }], isError: true };
    let income = 0, expense = 0;
    for (const e of expenses.data ?? []) {
      if (e.type === "income") income += Number(e.amount);
      else if (e.type === "expense") expense += Number(e.amount);
    }
    const result = {
      project: project.data,
      milestones: milestones.data ?? [],
      members: members.data ?? [],
      total_income: income,
      total_expense: expense,
      profit: income - expense,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
