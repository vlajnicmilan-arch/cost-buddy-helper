import { describe, it, expect } from "vitest";
import {
  detectProjectLossZone,
  detectOverdueInvoices,
  detectBudgetBurn,
  detectCashflowRisk,
  reconcileIssues,
} from "./issueDetection";

describe("detectProjectLossZone", () => {
  it("returns empty for no projects", () => {
    expect(detectProjectLossZone([], [])).toEqual([]);
  });

  it("skips projects with no contract_value", () => {
    const out = detectProjectLossZone(
      [{ id: "p1", name: "P1", contract_value: 0 }],
      [{ project_id: "p1", amount: 1000, type: "expense" }],
    );
    expect(out).toEqual([]);
  });

  it("skips healthy projects (margin >= 10%)", () => {
    const out = detectProjectLossZone(
      [{ id: "p1", name: "P1", contract_value: 1000 }],
      [{ project_id: "p1", amount: 500, type: "expense" }],
    );
    expect(out).toEqual([]);
  });

  it("flags warning when margin between 0 and 10%", () => {
    const out = detectProjectLossZone(
      [{ id: "p1", name: "Brač", contract_value: 1000 }],
      [{ project_id: "p1", amount: 950, type: "expense" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].dedup_key).toBe("project_loss_zone:p1");
    expect(out[0].title_vars).toEqual({ projectName: "Brač" });
  });

  it("flags critical when over budget", () => {
    const out = detectProjectLossZone(
      [{ id: "p1", name: "P1", contract_value: 1000 }],
      [{ project_id: "p1", amount: 1200, type: "expense" }],
    );
    expect(out[0].severity).toBe("critical");
  });

  it("excludes correction-nature expenses from spent", () => {
    const out = detectProjectLossZone(
      [{ id: "p1", name: "P1", contract_value: 1000 }],
      [
        { project_id: "p1", amount: 500, type: "expense" },
        { project_id: "p1", amount: 500, type: "expense", expense_nature: "correction" },
      ],
    );
    expect(out).toEqual([]); // only 500 spent → 50% margin → healthy
  });

  it("skips completed/cancelled projects", () => {
    const out = detectProjectLossZone(
      [{ id: "p1", name: "P1", contract_value: 1000, status: "completed" }],
      [{ project_id: "p1", amount: 1500, type: "expense" }],
    );
    expect(out).toEqual([]);
  });
});

describe("detectOverdueInvoices", () => {
  it("ignores invoices ≤ 7 days overdue", () => {
    expect(detectOverdueInvoices([
      { id: "i1", invoice_number: "001", daysOverdue: 5, remaining: 100 },
    ])).toEqual([]);
  });

  it("warning between 8-30 days", () => {
    const out = detectOverdueInvoices([
      { id: "i1", invoice_number: "001", daysOverdue: 15, remaining: 100 },
    ]);
    expect(out[0].severity).toBe("warning");
  });

  it("critical when > 30 days", () => {
    const out = detectOverdueInvoices([
      { id: "i1", invoice_number: "001", daysOverdue: 45, remaining: 200 },
    ]);
    expect(out[0].severity).toBe("critical");
    expect(out[0].dedup_key).toBe("overdue_invoice:i1");
  });

  it("ignores zero-remaining invoices", () => {
    expect(detectOverdueInvoices([
      { id: "i1", invoice_number: "001", daysOverdue: 20, remaining: 0 },
    ])).toEqual([]);
  });
});

describe("detectBudgetBurn", () => {
  it("ignores budgets with no plan", () => {
    expect(detectBudgetBurn([{ id: "b1", name: "B", planned: 0, spent: 50 }])).toEqual([]);
  });

  it("ignores under 85%", () => {
    expect(detectBudgetBurn([{ id: "b1", name: "B", planned: 100, spent: 80 }])).toEqual([]);
  });

  it("warning at 85-99%", () => {
    const out = detectBudgetBurn([{ id: "b1", name: "B", planned: 100, spent: 90 }]);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message_vars).toEqual({ spentPct: 90 });
  });

  it("critical at 100%+", () => {
    const out = detectBudgetBurn([{ id: "b1", name: "B", planned: 100, spent: 110 }]);
    expect(out[0].severity).toBe("critical");
  });
});

describe("detectCashflowRisk", () => {
  it("no issue when projected positive", () => {
    expect(detectCashflowRisk({
      currentBalance: 1000, expectedInflow: 500, expectedOutflow: 800,
    })).toEqual([]);
  });

  it("warning when projected negative", () => {
    const out = detectCashflowRisk({
      currentBalance: 100, expectedInflow: 0, expectedOutflow: 500,
    });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message_vars).toMatchObject({ daysAhead: 30, shortage: "400.00" });
  });
});

describe("reconcileIssues", () => {
  it("builds toUpsert and resolveScopes per type", () => {
    const result = reconcileIssues({
      project_loss_zone: [
        {
          type: "project_loss_zone",
          dedup_key: "project_loss_zone:p1",
          severity: "warning",
          title_key: "x",
          message_key: "y",
        },
      ],
      overdue_invoice: [],
    });
    expect(result.toUpsert).toHaveLength(1);
    expect(result.resolveScopes).toEqual([
      { type: "project_loss_zone", activeDedupKeys: ["project_loss_zone:p1"] },
      { type: "overdue_invoice", activeDedupKeys: [] },
    ]);
  });
});
