/**
 * Balance regression suite — 17 scenarios.
 *
 * Source of truth: consolidated list approved on 2026-07-07.
 *   Group A (1-9): external SQL harness scenarios
 *   Group B (1-8): gap scenarios from stabilization plan
 *
 * Status legend:
 *   PASS today                — brani trenutno ponašanje od regresije
 *   SKIP: BUG 1 (manual_entry) — čeka manual_entry intent fix
 *   SKIP: BUG 2 (atomic SET)  — čeka atomarni SET sidra
 *   DOC                       — fiksira postojeću (namjernu) semantiku
 *
 * SIBLING SUITE: supabase/tests/balance/ (SQL harness against real PG
 * functions). NIJEDAN deploy koji dira balance logiku ne ide bez zelene
 * SQL suite — vidjeti mem://features/balance-regression-testing-policy.
 */

import { describe, it, expect } from "vitest";
import {
  BalanceEngine,
  type Expense,
  type EngineMode,
  type TimeConfidence,
} from "../balanceEngineMirror";

// ---------- fixture helpers ----------

const SRC_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SRC_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function d(iso: string): Date {
  return new Date(iso);
}

let expenseCounter = 0;
function nextId(): string {
  expenseCounter += 1;
  return `exp-${expenseCounter.toString().padStart(6, "0")}`;
}

function mkExpense(overrides: Partial<Expense> & Pick<Expense, "type" | "amount">): Expense {
  return {
    id: nextId(),
    payment_source: `custom:${SRC_A}`,
    income_source_id: null,
    date: d("2026-01-15T00:00:00Z"),
    event_at: null,
    time_confidence: null,
    expense_nature: "regular",
    deleted_at: null,
    ...overrides,
  };
}

function newEngine(mode: EngineMode = "day_cut"): BalanceEngine {
  const eng = new BalanceEngine(mode);
  eng.addSource({ id: SRC_A, balance: 0, correction_anchor_date: null, correction_anchor_balance: null });
  eng.addSource({ id: SRC_B, balance: 0, correction_anchor_date: null, correction_anchor_balance: null });
  return eng;
}

/** Seeds anchor 946.60 @ 2026-06-01 09:00Z on SRC_A (used by A1/A2/A3). */
function seedAnchoredA(mode: EngineMode = "hybrid"): BalanceEngine {
  const eng = newEngine(mode);
  eng.setAnchor(SRC_A, d("2026-06-01T09:00:00Z"), 946.6);
  return eng;
}

// ---------- Group A: external SQL harness (9 scenarios) ----------

describe("Balance regression — Group A (external SQL harness)", () => {
  describe("A1 — C3 same-day expense after anchor (hybrid)", () => {
    it("historic C3 variant → excluded (day_cut of C3 in hybrid) [DOC, PASS today]", () => {
      const eng = seedAnchoredA("hybrid");
      eng.insert(
        mkExpense({
          type: "expense",
          amount: 20,
          date: d("2026-06-01T00:00:00Z"),
          event_at: d("2026-06-01T14:00:00Z"),
          time_confidence: "C3",
        }),
      );
      // C3 same-day → excluded by strict DAY `>` cut in hybrid mode.
      expect(eng.balanceOf(SRC_A)).toBe(946.6);
    });

    it('manual_entry variant → included → 926.60 [PR1 manual_entry, PASS]', () => {
      // Post-PR1: manual writes go through writerIntent='manual_entry' which
      // authoritatively sets event_at=now() + C2. This mirror test seeds
      // event_at/C2 directly to fixate the invariant: a C2 same-day row
      // AFTER the anchor MUST be included in hybrid mode (946.60 − 20).
      const eng = seedAnchoredA("hybrid");
      eng.insert(
        mkExpense({
          type: "expense",
          amount: 20,
          date: d("2026-06-01T00:00:00Z"),
          event_at: d("2026-06-01T14:00:00Z"),
          time_confidence: "C2", // promoted by manual_entry writer
        }),
      );
      expect(eng.balanceOf(SRC_A)).toBe(926.6);
    });
  });

  it("A2 — C3 expense next day after anchor → included [PASS today]", () => {
    const eng = seedAnchoredA("hybrid");
    eng.insert(
      mkExpense({
        type: "expense",
        amount: 20,
        date: d("2026-06-02T00:00:00Z"),
        time_confidence: "C3",
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(926.6);
  });

  it("A3 — C1 same-day, event_at > anchor_ts → included [PASS today]", () => {
    const eng = seedAnchoredA("hybrid");
    eng.insert(
      mkExpense({
        type: "expense",
        amount: 20,
        date: d("2026-06-01T00:00:00Z"),
        event_at: d("2026-06-01T10:00:00Z"),
        time_confidence: "C1",
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(926.6);
  });

  it("A4 — atomic SET-anchor: stored == recompute immediately after setAnchor [PR2 Phase A]", () => {
    // Contract: after set_source_anchor RPC (or mirror's atomic setAnchor),
    // stored balance MUST already equal engine recompute — no dependency on
    // the next write to trigger reconciliation. Direct anchor UPDATE without
    // recompute is the bug this fixes; Phase B guard trigger will make the
    // buggy path impossible at the DB level.
    const eng = newEngine("hybrid");
    // Existing post-anchor expense already in the ledger
    eng.insert(mkExpense({ type: "expense", amount: 100, date: d("2026-06-05T00:00:00Z") }));
    // Atomic SET: anchor + recompute in one call
    eng.setAnchor(SRC_A, d("2026-06-01T09:00:00Z"), 500);
    // Stored is ALREADY anchor(500) + post-anchor(-100) = 400 — no next write needed
    expect(eng.balanceOf(SRC_A)).toBe(400);
    // Sanity: a subsequent write doesn't shift the invariant
    eng.insert(mkExpense({ type: "income", amount: 1, date: d("2026-06-06T00:00:00Z") }));
    expect(eng.balanceOf(SRC_A)).toBe(401);
  });


  it("A5 — correction row does not count in post-anchor sum [PASS today]", () => {
    const eng = seedAnchoredA("hybrid");
    eng.insert(
      mkExpense({
        type: "expense",
        amount: 999,
        date: d("2026-06-05T00:00:00Z"),
        expense_nature: "correction",
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(946.6);
  });

  it("A6 — soft delete then restore on anchored source [PASS today]", () => {
    const eng = seedAnchoredA("hybrid");
    const e = mkExpense({ type: "expense", amount: 20, date: d("2026-06-02T00:00:00Z") });
    eng.insert(e);
    expect(eng.balanceOf(SRC_A)).toBe(926.6);
    eng.softDelete(e.id);
    expect(eng.balanceOf(SRC_A)).toBe(946.6);
    eng.restore(e.id);
    expect(eng.balanceOf(SRC_A)).toBe(926.6);
  });

  it("A7 — transfer anchored→unanchored (both legs correct) [PASS today]", () => {
    const eng = seedAnchoredA("hybrid"); // A anchored, B unanchored
    eng.insert(
      mkExpense({
        type: "transfer",
        amount: 40,
        date: d("2026-06-02T00:00:00Z"),
        payment_source: `custom:${SRC_A}`,
        income_source_id: SRC_B,
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(906.6); // 946.60 − 40
    expect(eng.balanceOf(SRC_B)).toBe(40);
  });

  it("A8 — UPDATE payment_source moves expense A→B, both unanchored [PASS today]", () => {
    const eng = newEngine("day_cut"); // both unanchored
    const e = mkExpense({
      type: "expense",
      amount: 30,
      payment_source: `custom:${SRC_A}`,
      date: d("2026-06-05T00:00:00Z"),
    });
    eng.insert(e);
    expect(eng.balanceOf(SRC_A)).toBe(-30);
    expect(eng.balanceOf(SRC_B)).toBe(0);
    eng.update(e.id, { payment_source: `custom:${SRC_B}` });
    expect(eng.balanceOf(SRC_A)).toBe(0);
    expect(eng.balanceOf(SRC_B)).toBe(-30);
  });

  it("A9 — same as A1 but day_cut mode → same exclude as hybrid for pure-historic C3 [DOC]", () => {
    const eng = seedAnchoredA("day_cut");
    eng.insert(
      mkExpense({
        type: "expense",
        amount: 20,
        date: d("2026-06-01T00:00:00Z"),
        event_at: d("2026-06-01T14:00:00Z"),
        time_confidence: "C3",
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(946.6);
  });
});

// ---------- Group B: gap scenarios (8) ----------

describe("Balance regression — Group B (gap scenarios)", () => {
  it("B1 — event_at == anchor_ts is EXCLUDED (strict `>`) [DOC]", () => {
    const eng = seedAnchoredA("hybrid");
    eng.insert(
      mkExpense({
        type: "expense",
        amount: 20,
        date: d("2026-06-01T00:00:00Z"),
        event_at: d("2026-06-01T09:00:00Z"), // exactly at anchor
        time_confidence: "C1",
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(946.6);
  });

  it("B2 — transfer unanchored→anchored (obrat A7) [PASS today]", () => {
    const eng = newEngine("hybrid");
    // Make B anchored, A unanchored
    eng.setAnchor(SRC_B, d("2026-06-01T09:00:00Z"), 200);
    eng.insert(
      mkExpense({
        type: "transfer",
        amount: 40,
        date: d("2026-06-02T00:00:00Z"),
        payment_source: `custom:${SRC_A}`,
        income_source_id: SRC_B,
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(-40);
    expect(eng.balanceOf(SRC_B)).toBe(240);
  });

  it("B3 — transfer anchored→anchored (oba kraja imaju sidro) [PASS today]", () => {
    const eng = newEngine("hybrid");
    eng.setAnchor(SRC_A, d("2026-06-01T09:00:00Z"), 500);
    eng.setAnchor(SRC_B, d("2026-06-01T09:00:00Z"), 200);
    eng.insert(
      mkExpense({
        type: "transfer",
        amount: 40,
        date: d("2026-06-02T00:00:00Z"),
        payment_source: `custom:${SRC_A}`,
        income_source_id: SRC_B,
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(460);
    expect(eng.balanceOf(SRC_B)).toBe(240);
  });

  it("B4 — rebaseline: new anchor replaces old, recompute uses najnovije [PASS today]", () => {
    const eng = newEngine("hybrid");
    eng.setAnchor(SRC_A, d("2026-05-01T09:00:00Z"), 100);
    eng.insert(mkExpense({ type: "expense", amount: 10, date: d("2026-05-10T00:00:00Z") })); // 90
    expect(eng.balanceOf(SRC_A)).toBe(90);
    // Rebaseline
    eng.setAnchor(SRC_A, d("2026-06-01T09:00:00Z"), 500);
    // Old post-anchor row is now pre-new-anchor → excluded, balance == 500
    expect(eng.balanceOf(SRC_A)).toBe(500);
  });

  it("B5 — recurring instance generated before anchor but event_at after → included [PASS today]", () => {
    const eng = seedAnchoredA("hybrid");
    eng.insert(
      mkExpense({
        type: "expense",
        amount: 15,
        date: d("2026-06-02T00:00:00Z"),
        event_at: d("2026-06-02T08:00:00Z"),
        time_confidence: "C2",
      }),
    );
    expect(eng.balanceOf(SRC_A)).toBe(931.6);
  });

  // B6/B7 marked vitest-only per approved scope (no SQL-specific logic).
  it("B6 — multi-currency source: FX ne utječe na post-anchor logiku [PASS today, vitest-only]", () => {
    // Mirror stores raw source-currency amounts; FX layer is upstream.
    const eng = seedAnchoredA("hybrid");
    eng.insert(mkExpense({ type: "expense", amount: 100.5, date: d("2026-06-05T00:00:00Z") }));
    expect(eng.balanceOf(SRC_A)).toBe(846.1);
  });

  it("B7 — bulk 100 rows around anchor, correct pre/post partitioning [PASS today, vitest-only]", () => {
    const eng = seedAnchoredA("day_cut");
    for (let i = 0; i < 50; i++) {
      eng.insert(mkExpense({ type: "expense", amount: 1, date: d("2026-05-15T00:00:00Z") })); // pre
    }
    for (let i = 0; i < 50; i++) {
      eng.insert(mkExpense({ type: "expense", amount: 1, date: d("2026-06-05T00:00:00Z") })); // post
    }
    expect(eng.balanceOf(SRC_A)).toBe(946.6 - 50);
  });

  it("B8 — sequential writes (serialized) on anchored source, stored == engine [PASS today]", () => {
    // Real concurrent race must be tested in SQL suite (advisory lock). In
    // vitest we assert serialized invariant: after N writes, stored equals
    // full recompute.
    const eng = seedAnchoredA("hybrid");
    for (let i = 0; i < 10; i++) {
      eng.insert(mkExpense({ type: "expense", amount: 5, date: d("2026-06-05T00:00:00Z") }));
    }
    expect(eng.balanceOf(SRC_A)).toBe(946.6 - 50);
    // Recompute must be idempotent
    const before = eng.balanceOf(SRC_A);
    eng.recompute(SRC_A);
    expect(eng.balanceOf(SRC_A)).toBe(before);
  });
});
