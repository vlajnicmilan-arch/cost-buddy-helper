import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_client";

export default defineTool({
  name: "create_project",
  title: "Create project",
  description:
    "Create a new project for the signed-in user. project_type is a preset key like 'construction', 'freelance', 'event', 'renovation', 'other'.",
  inputSchema: {
    name: z.string().describe("Project name."),
    project_type: z.string().describe("Preset key. Defaults to 'other'."),
    total_budget: z.number().describe("Planned total budget. Defaults to 0."),
    description: z.string().describe("Optional description."),
    start_date: z.string().describe("ISO date YYYY-MM-DD. Optional."),
    end_date: z.string().describe("ISO date YYYY-MM-DD. Optional."),
    status: z.string().describe("'active' | 'on_hold' | 'completed'. Defaults to 'active'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const row = {
      user_id: ctx.getUserId(),
      name: input.name,
      project_type: input.project_type || "other",
      total_budget: input.total_budget ?? 0,
      description: input.description || null,
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      status: input.status || "active",
    };
    const { data, error } = await supabaseForUser(ctx)
      .from("projects")
      .insert(row)
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created project ${data.id}` }],
      structuredContent: { project: data },
    };
  },
});
