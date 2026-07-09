import { describe, it, expect } from "vitest";
import { computeBudgetPaceSignal, computeFrameAllocation } from "../budgetPaceSignal";

// Fiksni period: 30 dana, okvir 1000
const start = new Date("2026-06-01T00:00:00Z");
const end = new Date("2026-06-30T23:59:59.999Z");

describe("computeBudgetPaceSignal", () => {
  it("ne šalje signal prije 3. dana perioda (rani veliki trošak)", () => {
    // Dan 2 (48h), potrošeno 400/1000 = 40% okvira, elapsed ~ 6.67% → gap ~33pp
    const now = new Date(start.getTime() + 2 * 24 * 3600 * 1000);
    const r = computeBudgetPaceSignal({
      spent: 400, totalAmount: 1000, startDate: start, endDate: end, now,
    });
    expect(r.shouldSignal).toBe(false);
    expect(r.reason).toBe("before_min_days");
  });

  it("na točno 3. danu i iznad praga → signal", () => {
    // Dan 3, elapsed ~ 10%, potrošeno 40% → gap 30pp
    const now = new Date(start.getTime() + 3 * 24 * 3600 * 1000);
    const r = computeBudgetPaceSignal({
      spent: 400, totalAmount: 1000, startDate: start, endDate: end, now,
    });
    expect(r.shouldSignal).toBe(true);
    expect(r.reason).toBe("signal");
    expect(Math.round(r.gapPp)).toBeGreaterThanOrEqual(20);
  });

  it("granica praga: gap ≥ 20pp točno → signal", () => {
    // Dan 15 ~ 50% elapsed, potrošeno 71% (small buffer for period rounding) → gap ~21pp
    const now = new Date(start.getTime() + 15 * 24 * 3600 * 1000);
    const r = computeBudgetPaceSignal({
      spent: 710, totalAmount: 1000, startDate: start, endDate: end, now,
    });
    expect(r.shouldSignal).toBe(true);
    expect(r.gapPp).toBeGreaterThanOrEqual(20);
  });

  it("gap < 20pp → nema signala", () => {
    // Dan 15, potrošeno 65% → gap 15pp
    const now = new Date(start.getTime() + 15 * 24 * 3600 * 1000);
    const r = computeBudgetPaceSignal({
      spent: 650, totalAmount: 1000, startDate: start, endDate: end, now,
    });
    expect(r.shouldSignal).toBe(false);
    expect(r.reason).toBe("below_threshold");
  });

  it("okvir 0 ili totalMs <= 0 → invalid_input", () => {
    expect(computeBudgetPaceSignal({
      spent: 100, totalAmount: 0, startDate: start, endDate: end, now: new Date(start.getTime() + 10 * 24 * 3600 * 1000),
    }).reason).toBe("invalid_input");
    expect(computeBudgetPaceSignal({
      spent: 100, totalAmount: 1000, startDate: end, endDate: start, now: start,
    }).reason).toBe("invalid_input");
  });

  it("now izvan perioda → invalid_input (bez signala)", () => {
    const before = new Date(start.getTime() - 1000);
    const after = new Date(end.getTime() + 1000);
    expect(computeBudgetPaceSignal({ spent: 500, totalAmount: 1000, startDate: start, endDate: end, now: before }).shouldSignal).toBe(false);
    expect(computeBudgetPaceSignal({ spent: 500, totalAmount: 1000, startDate: start, endDate: end, now: after }).shouldSignal).toBe(false);
  });

  it("prilagodljiv threshold (npr. 30pp) mijenja odluku", () => {
    // Dan 15 ~ 50% elapsed, potrošeno 75% → gap ~25pp
    const now = new Date(start.getTime() + 15 * 24 * 3600 * 1000);
    const base = { spent: 750, totalAmount: 1000, startDate: start, endDate: end, now };
    expect(computeBudgetPaceSignal({ ...base, thresholdPp: 30 }).shouldSignal).toBe(false);
    expect(computeBudgetPaceSignal({ ...base, thresholdPp: 20 }).shouldSignal).toBe(true);
  });
});

describe("computeFrameAllocation", () => {
  it("neusmjereno = okvir − Σ smjerovi", () => {
    const r = computeFrameAllocation(1000, [300, 200, 100]);
    expect(r.totalAllocated).toBe(600);
    expect(r.unallocated).toBe(400);
    expect(r.overFrame).toBe(0);
    expect(r.isOverFrame).toBe(false);
  });

  it("preko okvira dopušteno (neutralno, bez blokade)", () => {
    const r = computeFrameAllocation(1000, [700, 500]);
    expect(r.totalAllocated).toBe(1200);
    expect(r.unallocated).toBe(0);
    expect(r.overFrame).toBe(200);
    expect(r.isOverFrame).toBe(true);
  });

  it("okvir = Σ smjerovi → oba 0", () => {
    const r = computeFrameAllocation(1000, [400, 600]);
    expect(r.unallocated).toBe(0);
    expect(r.overFrame).toBe(0);
    expect(r.isOverFrame).toBe(false);
  });

  it("prazan popis smjerova → cijeli okvir neusmjeren", () => {
    const r = computeFrameAllocation(1000, []);
    expect(r.unallocated).toBe(1000);
  });
});
