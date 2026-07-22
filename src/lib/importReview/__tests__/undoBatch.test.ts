import { describe, it, expect } from "vitest";
import {
  computeBreakdown,
  mapUndoResult,
  type UndoBatchRow,
} from "../undoBatch";

const REF = new Date("2026-07-22T12:00:00Z");

function row(partial: Partial<UndoBatchRow>): UndoBatchRow {
  return {
    id: partial.id ?? crypto.randomUUID(),
    type: partial.type ?? "expense",
    amount: partial.amount ?? 0,
    bank_match_status: partial.bank_match_status ?? "bank_only",
    created_at: partial.created_at ?? "2026-07-22T09:00:00Z",
    date: partial.date ?? new Date("2026-07-22T00:00:00Z"),
  };
}

describe("computeBreakdown", () => {
  it("splits new / merged / transfer and sums gross", () => {
    const rows: UndoBatchRow[] = [
      row({ amount: 100, type: "expense", bank_match_status: "bank_only" }),
      row({ amount: 30, type: "expense", bank_match_status: "confirmed" }),
      row({ amount: 50, type: "transfer", bank_match_status: "bank_only" }),
      row({ amount: 25, type: "income", bank_match_status: "bank_only" }),
    ];
    const b = computeBreakdown(rows, REF);
    expect(b.newCount).toBe(2); // expense + income bank_only
    expect(b.mergedCount).toBe(1);
    expect(b.transferCount).toBe(1);
    expect(b.totalCount).toBe(4);
    expect(b.totalGross).toBe(205);
  });

  it("confirmed transfer counts as merged, not transfer", () => {
    // A transfer that was manually merged shouldn't double-count.
    const rows = [row({ type: "transfer", amount: 10, bank_match_status: "confirmed" })];
    const b = computeBreakdown(rows, REF);
    expect(b.mergedCount).toBe(1);
    expect(b.transferCount).toBe(0);
  });

  it("age warning triggers strictly above 7 days", () => {
    const old = row({ created_at: "2026-07-14T11:59:00Z" }); // 8 days
    const fresh = row({ created_at: "2026-07-15T13:00:00Z" }); // 7 days
    expect(computeBreakdown([old], REF).ageDays).toBe(8);
    expect(computeBreakdown([old], REF).isOld).toBe(true);
    expect(computeBreakdown([fresh], REF).ageDays).toBe(6);
    expect(computeBreakdown([fresh], REF).isOld).toBe(false);
  });

  it("empty batch → zeros, ageDays 0", () => {
    const b = computeBreakdown([], REF);
    expect(b).toMatchObject({
      newCount: 0,
      mergedCount: 0,
      transferCount: 0,
      totalCount: 0,
      totalGross: 0,
      ageDays: 0,
      isOld: false,
    });
  });

  it("falls back to date when created_at missing", () => {
    const r = row({ created_at: null, date: new Date("2026-07-10T00:00:00Z") });
    const b = computeBreakdown([r], REF);
    expect(b.ageDays).toBe(12);
    expect(b.isOld).toBe(true);
  });
});

describe("mapUndoResult", () => {
  it("maps normal success", () => {
    const p = mapUndoResult({
      deleted: 2,
      unmerged: 1,
      transfers: 1,
      already_undone: false,
      had_bank_anchor: false,
      freed_fingerprint: true,
      source_ids: ["src-1"],
    });
    expect(p).toEqual({
      kind: "success",
      deleted: 2,
      unmerged: 1,
      transfers: 1,
      hadBankAnchor: false,
      sourceIds: ["src-1"],
    });
  });

  it("maps success_with_anchor when had_bank_anchor", () => {
    const p = mapUndoResult({ deleted: 1, unmerged: 0, transfers: 0, had_bank_anchor: true, source_ids: ["s"] });
    expect(p.kind).toBe("success_with_anchor");
  });

  it("maps already_undone path (idempotency)", () => {
    const p = mapUndoResult({ deleted: 0, unmerged: 0, transfers: 0, already_undone: true });
    expect(p.kind).toBe("already_undone");
    expect(p.deleted).toBe(0);
    expect(p.sourceIds).toEqual([]);
  });

  it("defends against null / undefined / missing fields", () => {
    expect(mapUndoResult(null)).toEqual({
      kind: "success",
      deleted: 0,
      unmerged: 0,
      transfers: 0,
      hadBankAnchor: false,
      sourceIds: [],
    });
    expect(mapUndoResult(undefined)).toMatchObject({ kind: "success", deleted: 0 });
    // @ts-expect-error — simulate shape drift
    expect(mapUndoResult({ deleted: "3" })).toMatchObject({ deleted: 3 });
  });
});
