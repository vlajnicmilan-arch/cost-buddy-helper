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

describe("Val 3 — hybrid mode (per-row cut by time_confidence)", () => {
  const HSRC = "src-A";
  const HOTHER = "src-B";
  // Anchor at a precise instant — afternoon of 2026-06-24 in UTC.
  const HANCHOR = "2026-06-24T14:00:00.000Z";
  const HBAL = 100;

  const hrow = (overrides: Partial<AnchorExpenseRow>): AnchorExpenseRow => ({
    date: "2026-06-25T00:00:00.000Z",
    type: "expense",
    amount: 10,
    paymentSourceId: HSRC,
    incomeSourceId: null,
    expenseNature: "regular",
    deletedAt: null,
    eventAt: null,
    timeConfidence: "C3",
    ...overrides,
  });

  it("H1. C1 row with event_at AFTER anchor → counted by timestamp", () => {
    // Same calendar day as anchor; under day_cut this would be excluded.
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: "2026-06-24T15:00:00.000Z",
          eventAt: "2026-06-24T15:00:00.000Z",
          timeConfidence: "C1",
          type: "income",
          amount: 40,
        }),
      ],
    });
    expect(balance).toBe(140);
  });

  it("H2. C1 row with event_at BEFORE anchor → excluded", () => {
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: "2026-06-24T13:00:00.000Z",
          eventAt: "2026-06-24T13:00:00.000Z",
          timeConfidence: "C1",
          type: "income",
          amount: 999,
        }),
      ],
    });
    expect(balance).toBe(100);
  });

  it("H3. C1 row with event_at EXACTLY at anchor → excluded (strict >)", () => {
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: HANCHOR,
          eventAt: HANCHOR,
          timeConfidence: "C1",
          type: "income",
          amount: 50,
        }),
      ],
    });
    expect(balance).toBe(100);
  });

  it("H4. C2 row behaves like C1 (precise tier, timestamp cut)", () => {
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: "2026-06-24T20:00:00.000Z",
          eventAt: "2026-06-24T20:00:00.000Z",
          timeConfidence: "C2",
          type: "income",
          amount: 30,
        }),
        hrow({
          date: "2026-06-24T10:00:00.000Z",
          eventAt: "2026-06-24T10:00:00.000Z",
          timeConfidence: "C2",
          type: "income",
          amount: 999,
        }),
      ],
    });
    expect(balance).toBe(130);
  });

  it("H5. C3 row on anchor day stays EXCLUDED (day-cut fallback)", () => {
    // Even with an event_at after the anchor instant, C3 must fall back to day cut.
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: "2026-06-24T20:00:00.000Z",
          eventAt: "2026-06-24T20:00:00.000Z",
          timeConfidence: "C3",
          type: "income",
          amount: 999,
        }),
      ],
    });
    expect(balance).toBe(100);
  });

  it("H6. C4 row on anchor day stays EXCLUDED (day-cut fallback)", () => {
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: "2026-06-24T22:00:00.000Z",
          eventAt: "2026-06-24T22:00:00.000Z",
          timeConfidence: "C4",
          type: "income",
          amount: 999,
        }),
      ],
    });
    expect(balance).toBe(100);
  });

  it("H7. NULL time_confidence falls back to day cut", () => {
    const sameDay = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: "2026-06-24T23:00:00.000Z",
          eventAt: "2026-06-24T23:00:00.000Z",
          timeConfidence: null,
          type: "income",
          amount: 200,
        }),
      ],
    });
    const nextDay = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: "2026-06-25T00:00:00.000Z",
          eventAt: null,
          timeConfidence: null,
          type: "income",
          amount: 200,
        }),
      ],
    });
    expect(sameDay).toBe(100);
    expect(nextDay).toBe(300);
  });

  it("H8. C1 row with NULL event_at is SKIPPED (cannot apply timestamp cut)", () => {
    // Defensive: a precise tier without a timestamp is malformed; do not silently
    // promote it to day-cut behaviour.
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        hrow({
          date: "2026-06-26T00:00:00.000Z",
          eventAt: null,
          timeConfidence: "C1",
          type: "income",
          amount: 999,
        }),
      ],
    });
    expect(balance).toBe(100);
  });

  it("H9. correction and deleted filters apply BEFORE tier branching", () => {
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        // C1 correction — never counted, even with precise post-anchor timestamp.
        hrow({
          date: "2026-06-24T18:00:00.000Z",
          eventAt: "2026-06-24T18:00:00.000Z",
          timeConfidence: "C1",
          expenseNature: "correction",
          type: "income",
          amount: 9999,
        }),
        // C1 deleted — never counted.
        hrow({
          date: "2026-06-25T10:00:00.000Z",
          eventAt: "2026-06-25T10:00:00.000Z",
          timeConfidence: "C1",
          deletedAt: "2026-06-25T11:00:00.000Z",
          type: "income",
          amount: 9999,
        }),
        // Regular C1 income that DOES count.
        hrow({
          date: "2026-06-24T16:00:00.000Z",
          eventAt: "2026-06-24T16:00:00.000Z",
          timeConfidence: "C1",
          type: "income",
          amount: 25,
        }),
      ],
    });
    expect(balance).toBe(125);
  });

  it("H10. mixed scenario: C1 timestamp wins, C3 same-day excluded, transfers obey per-row cut", () => {
    const balance = computeAnchoredBalance({
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      mode: "hybrid",
      expenses: [
        // C1 income after anchor instant, same day → +50 (vs day_cut would exclude)
        hrow({
          date: "2026-06-24T15:00:00.000Z",
          eventAt: "2026-06-24T15:00:00.000Z",
          timeConfidence: "C1",
          type: "income",
          amount: 50,
        }),
        // C3 expense same day as anchor → excluded by day cut
        hrow({
          date: "2026-06-24T20:00:00.000Z",
          timeConfidence: "C3",
          type: "expense",
          amount: 999,
        }),
        // C3 income next day → +20 (day cut)
        hrow({
          date: "2026-06-25T00:00:00.000Z",
          timeConfidence: "C3",
          type: "income",
          amount: 20,
        }),
        // C1 transfer-in from another source, same day, after anchor → +15
        hrow({
          date: "2026-06-24T17:00:00.000Z",
          eventAt: "2026-06-24T17:00:00.000Z",
          timeConfidence: "C1",
          type: "transfer",
          amount: 15,
          paymentSourceId: HOTHER,
          incomeSourceId: HSRC,
        }),
        // C1 transfer-out same day, before anchor → excluded
        hrow({
          date: "2026-06-24T09:00:00.000Z",
          eventAt: "2026-06-24T09:00:00.000Z",
          timeConfidence: "C1",
          type: "transfer",
          amount: 999,
          paymentSourceId: HSRC,
          incomeSourceId: HOTHER,
        }),
      ],
    });
    // 100 + 50 + 20 + 15
    expect(balance).toBe(185);
  });

  it("H11. default mode is day_cut — same input differs between modes", () => {
    // Sanity: omitting `mode` keeps Rule B; supplying 'hybrid' diverges.
    const input = {
      sourceId: HSRC,
      anchorDate: HANCHOR,
      anchorBalance: HBAL,
      expenses: [
        hrow({
          date: "2026-06-24T15:00:00.000Z",
          eventAt: "2026-06-24T15:00:00.000Z",
          timeConfidence: "C1" as const,
          type: "income",
          amount: 40,
        }),
      ],
    };
    expect(computeAnchoredBalance(input)).toBe(100);
    expect(computeAnchoredBalance({ ...input, mode: "hybrid" })).toBe(140);
  });
});
