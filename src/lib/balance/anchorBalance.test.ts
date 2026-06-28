/**
 * Regression suite for Rule B (anchor cuts the whole calendar day).
 * See `anchorBalance.ts` for the rule statement.
 *
 * Each test is written so the expectation is readable WITHOUT inspecting
 * the helper — the rule is visible from the scenario, not hidden in magic.
 */
import { describe, it, expect } from "vitest";
import {
  computeAnchoredBalance,
  type AnchorExpenseRow,
} from "./anchorBalance";

const SRC = "src-A";
const OTHER = "src-B";
const ANCHOR_DATE = "2026-06-24T14:00:00.000Z";
const ANCHOR_BALANCE = 100;

const row = (overrides: Partial<AnchorExpenseRow>): AnchorExpenseRow => ({
  date: "2026-06-25T00:00:00.000Z",
  type: "expense",
  amount: 10,
  paymentSourceId: SRC,
  incomeSourceId: null,
  expenseNature: "regular",
  deletedAt: null,
  ...overrides,
});

describe("Rule B — anchor cuts the whole calendar day", () => {
  it("1. transactions BEFORE the anchor day are excluded", () => {
    const balance = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        row({ date: "2026-06-23T08:00:00.000Z", type: "expense", amount: 30 }),
        row({ date: "2026-06-20T00:00:00.000Z", type: "income", amount: 999 }),
      ],
    });
    expect(balance).toBe(100);
  });

  it("2. transactions ON the anchor day are excluded (even if hour > anchor hour)", () => {
    const balance = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        row({ date: "2026-06-24T00:00:00.000Z", type: "expense", amount: 30 }),
        row({ date: "2026-06-24T15:30:00.000Z", type: "income", amount: 50 }),
        row({ date: "2026-06-24T23:59:59.000Z", type: "expense", amount: 5 }),
      ],
    });
    expect(balance).toBe(100);
  });

  it("3. transactions AFTER the anchor day are included", () => {
    const balance = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        row({ date: "2026-06-25T08:00:00.000Z", type: "expense", amount: 30 }),
        row({ date: "2026-06-26T00:00:00.000Z", type: "income", amount: 50 }),
      ],
    });
    expect(balance).toBe(120);
  });

  it("4. correction rows are never counted", () => {
    const balance = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        row({ date: "2026-06-25T00:00:00.000Z", type: "expense", amount: 30 }),
        row({
          date: "2026-06-26T00:00:00.000Z",
          type: "income",
          amount: 9999,
          expenseNature: "correction",
        }),
      ],
    });
    expect(balance).toBe(70);
  });

  it("5. soft-deleted rows are never counted", () => {
    const balance = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        row({ date: "2026-06-25T00:00:00.000Z", type: "expense", amount: 30 }),
        row({
          date: "2026-06-26T00:00:00.000Z",
          type: "expense",
          amount: 999,
          deletedAt: "2026-06-26T01:00:00.000Z",
        }),
      ],
    });
    expect(balance).toBe(70);
  });

  it("6. anchored balance equals anchor + post-day valid sum (mixed scenario)", () => {
    const balance = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        row({ date: "2026-06-23T00:00:00.000Z", type: "expense", amount: 500 }),
        row({ date: "2026-06-24T20:00:00.000Z", type: "income", amount: 500 }),
        row({
          date: "2026-06-25T00:00:00.000Z",
          type: "income",
          amount: 500,
          expenseNature: "correction",
        }),
        row({
          date: "2026-06-26T00:00:00.000Z",
          type: "expense",
          amount: 500,
          deletedAt: "2026-06-26T01:00:00.000Z",
        }),
        row({
          date: "2026-06-27T00:00:00.000Z",
          type: "expense",
          amount: 500,
          paymentSourceId: OTHER,
        }),
        row({
          date: "2026-06-25T00:00:00.000Z",
          type: "transfer",
          amount: 25,
          paymentSourceId: OTHER,
          incomeSourceId: SRC,
        }),
        row({
          date: "2026-06-26T00:00:00.000Z",
          type: "transfer",
          amount: 10,
          paymentSourceId: SRC,
          incomeSourceId: OTHER,
        }),
        row({ date: "2026-06-27T00:00:00.000Z", type: "income", amount: 40 }),
        row({ date: "2026-06-28T00:00:00.000Z", type: "expense", amount: 5 }),
      ],
    });
    // 100 + 25 - 10 + 40 - 5
    expect(balance).toBe(150);
  });

  it("7. Rule B is readable: same-day income does NOT appear, next-day income DOES", () => {
    const sameDay = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        row({ date: "2026-06-24T23:00:00.000Z", type: "income", amount: 200 }),
      ],
    });
    const nextDay = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        row({ date: "2026-06-25T00:00:00.000Z", type: "income", amount: 200 }),
      ],
    });
    expect(sameDay).toBe(100);
    expect(nextDay).toBe(300);
  });

  it("8. Val 2: a C1 correction row with a precise event_at does NOT change Rule B semantics", () => {
    // Val 2 introduces precision foundation (event_at + time_confidence),
    // but does NOT change the anchor execution model. A correction row is
    // STILL never counted toward the post-anchor sum, regardless of its
    // confidence tier or the precision of its event_at. The balance engine
    // pass that consumes event_at is a separate, later wave.
    const balance = computeAnchoredBalance({
      sourceId: SRC,
      anchorDate: ANCHOR_DATE,
      anchorBalance: ANCHOR_BALANCE,
      expenses: [
        // High-precision C1 correction landing AFTER the anchor day.
        // If anchor semantics had been silently changed to consume
        // event_at, this row would skew the result. It must not.
        row({
          date: "2026-06-25T10:00:00.000Z",
          type: "income",
          amount: 9999,
          expenseNature: "correction",
        }),
        // Regular post-anchor income that DOES count.
        row({ date: "2026-06-25T11:00:00.000Z", type: "income", amount: 25 }),
      ],
    });
    expect(balance).toBe(125);
  });
});
