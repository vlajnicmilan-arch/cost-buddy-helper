import { describe, it, expect } from "vitest";
import {
  computeObservations,
  pickObservation,
  type ExpenseLite,
  type ObservationContext,
} from "@/lib/dailySummaryObservations";

function ymd(date: string): string {
  return date;
}

function exp(
  date: string,
  amount: number,
  merchant?: string,
  category?: string,
): ExpenseLite {
  return { date: ymd(date), amount, merchant_name: merchant, category };
}

const baseCtx = (overrides: Partial<ObservationContext> = {}): ObservationContext => ({
  today: "2026-06-02", // Tuesday (weekday)
  isWeekend: false,
  todayExpenses: [],
  history: [],
  streakDays: 0,
  prevStreakDays: 0,
  hasBudget: false,
  ...overrides,
});

describe("computeObservations", () => {
  it("always returns fallback budget_ok_quiet", () => {
    const obs = computeObservations(baseCtx());
    expect(obs.some((o) => o.type === "budget_ok_quiet")).toBe(true);
  });

  it("detects zero_spend when user usually spends", () => {
    // 10 days with spend in last 14
    const history: ExpenseLite[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date("2026-06-02T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      history.push(exp(d.toISOString().slice(0, 10), 20, "shop"));
    }
    const obs = computeObservations(baseCtx({ history }));
    expect(obs.some((o) => o.type === "zero_spend")).toBe(true);
  });

  it("does NOT flag zero_spend when user rarely spends", () => {
    const obs = computeObservations(baseCtx({ history: [exp("2026-05-20", 10)] }));
    expect(obs.some((o) => o.type === "zero_spend")).toBe(false);
  });

  it("detects quiet_day vs comparable weekday avg", () => {
    // 10 weekdays in last 28 with ~50 EUR each, today 10 EUR
    const history: ExpenseLite[] = [];
    const start = new Date("2026-06-02T00:00:00Z");
    let added = 0;
    let offset = 1;
    while (added < 10 && offset < 28) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() - offset);
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) {
        history.push(exp(d.toISOString().slice(0, 10), 50));
        added++;
      }
      offset++;
    }
    const obs = computeObservations(
      baseCtx({ todayExpenses: [exp("2026-06-02", 10)], history }),
    );
    expect(obs.some((o) => o.type === "quiet_day")).toBe(true);
  });

  it("detects big_spike vs comparable weekday avg", () => {
    const history: ExpenseLite[] = [];
    const start = new Date("2026-06-02T00:00:00Z");
    let added = 0;
    let offset = 1;
    while (added < 10 && offset < 28) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() - offset);
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) {
        history.push(exp(d.toISOString().slice(0, 10), 30));
        added++;
      }
      offset++;
    }
    const obs = computeObservations(
      baseCtx({ todayExpenses: [exp("2026-06-02", 120)], history }),
    );
    expect(obs.some((o) => o.type === "big_spike")).toBe(true);
  });

  it("detects outlier_transaction (>=3x merchant median, hist>=3)", () => {
    const history: ExpenseLite[] = [
      exp("2026-05-25", 20, "Lidl"),
      exp("2026-05-26", 25, "Lidl"),
      exp("2026-05-27", 22, "Lidl"),
    ];
    const obs = computeObservations(
      baseCtx({
        todayExpenses: [exp("2026-06-02", 150, "Lidl")],
        history,
      }),
    );
    expect(obs.some((o) => o.type === "outlier_transaction")).toBe(true);
  });

  it("detects new_merchant", () => {
    const history = [exp("2026-05-20", 10, "Konzum")];
    const obs = computeObservations(
      baseCtx({ todayExpenses: [exp("2026-06-02", 25, "Spar")], history }),
    );
    expect(obs.some((o) => o.type === "new_merchant")).toBe(true);
  });

  it("does NOT flag new_merchant when merchant exists in history", () => {
    const history = [exp("2026-05-20", 10, "Konzum")];
    const obs = computeObservations(
      baseCtx({ todayExpenses: [exp("2026-06-02", 25, "konzum")], history }),
    );
    expect(obs.some((o) => o.type === "new_merchant")).toBe(false);
  });

  it("detects streak_milestone at 30 days", () => {
    const obs = computeObservations(
      baseCtx({ hasBudget: true, streakDays: 30, prevStreakDays: 29 }),
    );
    expect(obs.some((o) => o.type === "streak_milestone")).toBe(true);
  });

  it("does NOT emit milestone on non-milestone day", () => {
    const obs = computeObservations(
      baseCtx({ hasBudget: true, streakDays: 12, prevStreakDays: 11 }),
    );
    expect(obs.some((o) => o.type === "streak_milestone")).toBe(false);
  });

  it("detects streak_broken when streak collapses from >=7 to 0", () => {
    const obs = computeObservations(
      baseCtx({ hasBudget: true, streakDays: 0, prevStreakDays: 10 }),
    );
    expect(obs.some((o) => o.type === "streak_broken")).toBe(true);
  });

  it("detects category_shift when dominant category not in monthly top 3", () => {
    const history: ExpenseLite[] = [];
    // Top 3 monthly categories: food, transport, utilities
    for (let i = 1; i <= 20; i++) {
      const d = new Date("2026-06-02T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      const day = d.toISOString().slice(0, 10);
      history.push(exp(day, 30, "x", "food"));
      history.push(exp(day, 20, "y", "transport"));
      history.push(exp(day, 15, "z", "utilities"));
    }
    const obs = computeObservations(
      baseCtx({
        todayExpenses: [exp("2026-06-02", 100, "Mall", "fashion")],
        history,
      }),
    );
    expect(obs.some((o) => o.type === "category_shift")).toBe(true);
  });
});

describe("pickObservation", () => {
  it("returns highest-strength observation", () => {
    const picked = pickObservation(
      [
        { type: "budget_ok_quiet", strength: 10, payload: {} },
        { type: "big_spike", strength: 70, payload: {} },
        { type: "quiet_day", strength: 50, payload: {} },
      ],
      {},
      "2026-06-02",
    );
    expect(picked.type).toBe("big_spike");
  });

  it("demotes same observation type from yesterday", () => {
    const picked = pickObservation(
      [
        { type: "quiet_day", strength: 60, payload: {} },
        { type: "big_spike", strength: 50, payload: {} },
      ],
      {
        last_observation_type: "quiet_day",
        last_observation_date: "2026-06-01",
      },
      "2026-06-02",
    );
    expect(picked.type).toBe("big_spike");
  });

  it("does NOT demote when observation is very strong (>=80)", () => {
    const picked = pickObservation(
      [
        { type: "quiet_day", strength: 85, payload: {} },
        { type: "big_spike", strength: 70, payload: {} },
      ],
      {
        last_observation_type: "quiet_day",
        last_observation_date: "2026-06-01",
      },
      "2026-06-02",
    );
    expect(picked.type).toBe("quiet_day");
  });

  it("demotes same merchant as yesterday", () => {
    const picked = pickObservation(
      [
        {
          type: "new_merchant",
          strength: 65,
          payload: { merchant: "Lidl", merchantKey: "lidl" },
        },
        { type: "quiet_day", strength: 50, payload: {} },
      ],
      {
        last_merchant_mentioned: "Lidl",
        last_observation_date: "2026-06-01",
      },
      "2026-06-02",
    );
    expect(picked.type).toBe("quiet_day");
  });

  it("tie-break: milestone wins over equal-strength others", () => {
    const picked = pickObservation(
      [
        { type: "category_shift", strength: 70, payload: {} },
        { type: "streak_milestone", strength: 70, payload: { days: 30 } },
      ],
      {},
      "2026-06-02",
    );
    expect(picked.type).toBe("streak_milestone");
  });

  it("falls back to budget_ok_quiet for empty array", () => {
    const picked = pickObservation([], {}, "2026-06-02");
    expect(picked.type).toBe("budget_ok_quiet");
  });
});
