/**
 * Regression suite for the Val 1 `expenses_event_at_sync` trigger contract.
 *
 * IMPORTANT: These tests exercise a TS port of the trigger (see
 * `eventAtTrigger.ts`), not the live Postgres trigger. The live trigger was
 * additionally probed against the production schema after migration:
 *   - 2029/2029 rows backfilled with time_confidence='C3'
 *   - invariant (event_at AT TZ Europe/Zagreb)::date == (date AT TZ
 *     Europe/Zagreb)::date held on 100% of rows.
 *
 * No pgTAP/SQL test harness exists in this project. Adding one is out of
 * scope for Val 1.
 */
import { describe, it, expect } from "vitest";
import {
  applyInsertTrigger,
  applyUpdateTrigger,
  deriveC3EventAt,
} from "./eventAtTrigger";

const ZAGREB_NOON = (ymd: string) => deriveC3EventAt(`${ymd}T00:00:00.000Z`);

describe("Val 1 — event_at trigger contract", () => {
  it("1. backfill / default: row without event_at gets C3 + derived noon", () => {
    const r = applyInsertTrigger({ date: "2026-06-28T08:34:00.000Z" });
    expect(r.time_confidence).toBe("C3");
    expect(r.event_at).toBe(ZAGREB_NOON("2026-06-28"));
  });

  it("2. INSERT without event_at derives event_at from date (noon Europe/Zagreb)", () => {
    const r = applyInsertTrigger({
      date: "2026-01-15T00:00:00.000Z",
      time_confidence: "C3",
    });
    // Zagreb in January is UTC+1, so noon local == 11:00 UTC.
    expect(r.event_at).toBe("2026-01-15T11:00:00.000Z");
  });

  it("2b. INSERT with explicit event_at honors writer", () => {
    const r = applyInsertTrigger({
      date: "2026-06-28T00:00:00.000Z",
      event_at: "2026-06-28T14:23:00.000Z",
      time_confidence: "C1",
    });
    expect(r.event_at).toBe("2026-06-28T14:23:00.000Z");
    expect(r.time_confidence).toBe("C1");
  });

  it("3. UPDATE: changing date on a C3 row re-derives event_at", () => {
    const oldRow = {
      date: "2026-01-05T00:00:00.000Z",
      event_at: "2026-01-05T11:00:00.000Z",
      time_confidence: "C3" as const,
    };
    const next = applyUpdateTrigger(oldRow, {
      date: "2026-02-10T00:00:00.000Z",
    });
    expect(next.event_at).toBe(ZAGREB_NOON("2026-02-10"));
    expect(next.time_confidence).toBe("C3");
  });

  it("4a. UPDATE: changing date on a C1 row must NOT touch event_at", () => {
    const oldRow = {
      date: "2026-01-05T00:00:00.000Z",
      event_at: "2026-01-05T14:23:00.000Z",
      time_confidence: "C1" as const,
    };
    const next = applyUpdateTrigger(oldRow, {
      date: "2026-02-10T00:00:00.000Z",
    });
    expect(next.event_at).toBe("2026-01-05T14:23:00.000Z");
  });

  it("4b. UPDATE: changing date on a C2 row must NOT touch event_at", () => {
    const oldRow = {
      date: "2026-01-05T00:00:00.000Z",
      event_at: "2026-01-05T09:00:00.000Z",
      time_confidence: "C2" as const,
    };
    const next = applyUpdateTrigger(oldRow, {
      date: "2026-02-10T00:00:00.000Z",
    });
    expect(next.event_at).toBe("2026-01-05T09:00:00.000Z");
  });

  it("5. UPDATE: explicit writer event_at always wins over derivation", () => {
    const oldRow = {
      date: "2026-01-05T00:00:00.000Z",
      event_at: "2026-01-05T11:00:00.000Z",
      time_confidence: "C3" as const,
    };
    const next = applyUpdateTrigger(oldRow, {
      date: "2026-02-10T00:00:00.000Z",
      event_at: "2026-02-10T17:45:00.000Z",
      time_confidence: "C1",
    });
    expect(next.event_at).toBe("2026-02-10T17:45:00.000Z");
    expect(next.time_confidence).toBe("C1");
  });

  it("6. UPDATE: no date change, no event_at change → row untouched", () => {
    const oldRow = {
      date: "2026-01-05T00:00:00.000Z",
      event_at: "2026-01-05T11:00:00.000Z",
      time_confidence: "C3" as const,
    };
    const next = applyUpdateTrigger(oldRow, { /* unrelated patch */ });
    expect(next.event_at).toBe("2026-01-05T11:00:00.000Z");
    expect(next.date).toBe("2026-01-05T00:00:00.000Z");
  });

  it("7. summer/CEST derivation: noon local == 10:00 UTC in late June", () => {
    const r = applyInsertTrigger({ date: "2026-06-28T00:00:00.000Z" });
    expect(r.event_at).toBe("2026-06-28T10:00:00.000Z");
  });
});
