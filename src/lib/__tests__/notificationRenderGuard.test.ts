/**
 * Generic guard: rendered notification title/message must never contain
 * an unresolved `{{ }}` placeholder. Catches missing vars in title/message
 * templates (e.g. title uses {{spentPct}} but title_vars only has {{budgetName}}).
 */
import { describe, it, expect } from "vitest";
import i18n from "@/i18n";
import { resolveNotificationText } from "@/lib/notificationI18n";
import {
  detectBudgetBurn,
  detectOverdueInvoices,
  detectProjectLossZone,
  detectCashflowRisk,
} from "@/lib/issueDetection";

const t = i18n.getFixedT("hr");

function assertRendered(raw: string, vars: Record<string, unknown> | undefined) {
  const out = resolveNotificationText(raw, vars, t);
  expect(out, `unresolved placeholder in "${raw}" → "${out}"`).not.toMatch(/\{\{/);
}

describe("notification render guard — no unresolved {{ }}", () => {
  it("budget_burn warning renders both title and message fully", () => {
    const [c] = detectBudgetBurn([{ id: "b1", name: "Test", planned: 100, spent: 92 }]);
    assertRendered(c.title_key, c.title_vars);
    assertRendered(c.message_key, c.message_vars);
  });

  it("budget_burn over 100% renders both title and message fully", () => {
    const [c] = detectBudgetBurn([{ id: "b1", name: "Test", planned: 100, spent: 130 }]);
    assertRendered(c.title_key, c.title_vars);
    assertRendered(c.message_key, c.message_vars);
  });

  it("overdue_invoice renders fully", () => {
    const [c] = detectOverdueInvoices([
      { id: "i1", invoice_number: "001", daysOverdue: 20, remaining: 500 },
    ]);
    assertRendered(c.title_key, c.title_vars);
    assertRendered(c.message_key, c.message_vars);
  });

  it("cashflow_risk renders fully", () => {
    const [c] = detectCashflowRisk({
      currentBalance: 100, expectedInflow: 0, expectedOutflow: 500,
    });
    assertRendered(c.title_key, c.title_vars);
    assertRendered(c.message_key, c.message_vars);
  });

  it("project_loss_zone renders fully", () => {
    const out = detectProjectLossZone(
      [{ id: "p1", name: "Projekt", contract_value: 1000 } as any],
      [{ project_id: "p1", type: "expense", amount: 1200 } as any],
    );
    if (out[0]) {
      assertRendered(out[0].title_key, out[0].title_vars);
      assertRendered(out[0].message_key, out[0].message_vars);
    }
  });
});
