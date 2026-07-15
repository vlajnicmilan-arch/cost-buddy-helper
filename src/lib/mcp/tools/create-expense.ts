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
  name: "create_expense",
  title: "Create expense",
  description:
    "Insert a new expense (troška) for the signed-in user in Centar. Amount is a positive number in the given currency. Date is ISO (YYYY-MM-DD). Category is a free-form string.",
  inputSchema: {
    amount: z.number().positive().describe("Positive amount (e.g. 12.50)"),
    currency: z
      .string()
      .describe("ISO 4217 currency code, e.g. 'EUR'. Defaults to 'EUR'."),
    date: z
      .string()
      .describe("ISO date YYYY-MM-DD. Defaults to today if omitted."),
    category: z.string().describe("Category name, e.g. 'groceries'."),
    description: z.string().describe("Short description / merchant note."),
    payment_source: z
      .string()
      .describe(
        "Payment source id. Either a system id like 'cash' or 'custom:<uuid>' for a user wallet. Defaults to 'cash'.",
      ),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated" }],
        isError: true,
      };
    }
    const today = new Date().toISOString().slice(0, 10);
    const row = {
      user_id: ctx.getUserId(),
      type: "expense" as const,
      amount: input.amount,
      currency: (input.currency ?? "EUR").toUpperCase(),
      date: input.date ?? today,
      category: input.category ?? "other",
      description: input.description ?? "",
      payment_source: input.payment_source ?? "cash",
    };
    const { data, error } = await supabaseForUser(ctx)
      .from("expenses")
      .insert(row)
      .select()
      .single();

    if (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
    return {
      content: [
        { type: "text", text: `Created expense ${data?.id ?? ""}` },
      ],
      structuredContent: { expense: data },
    };
  },
});
