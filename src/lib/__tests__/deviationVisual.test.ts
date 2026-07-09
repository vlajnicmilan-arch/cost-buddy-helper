import { describe, it, expect } from "vitest";
import { getDeviationVisual } from "@/lib/deviationVisual";

describe("getDeviationVisual", () => {
  it("positive deviation → warning tone with up arrow", () => {
    const v = getDeviationVisual(100);
    expect(v.tone).toBe("over");
    expect(v.className).toContain("text-budget-warning");
    expect(v.sign).toBe("+");
    expect(v.showUpArrow).toBe(true);
  });

  it("negative deviation → neutral, no arrow, no green", () => {
    const v = getDeviationVisual(-10);
    expect(v.tone).toBe("neutral");
    expect(v.showUpArrow).toBe(false);
    expect(v.sign).toBe("−");
    expect(v.className).not.toMatch(/income|green|success/);
    expect(v.className).not.toMatch(/destructive|red/);
  });

  it("zero deviation → neutral, ± sign", () => {
    const v = getDeviationVisual(0);
    expect(v.tone).toBe("neutral");
    expect(v.sign).toBe("±");
    expect(v.showUpArrow).toBe(false);
  });

  it("never returns destructive/red styling", () => {
    for (const dev of [-500, -1, 0, 1, 500]) {
      expect(getDeviationVisual(dev).className).not.toMatch(/destructive|text-red/);
    }
  });
});
