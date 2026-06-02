// Pure helpers for the daily-summary push notifications.
// Computes a small set of contextual "observations" about the user's day
// and picks the most interesting one to surface in the push body.
//
// Used by `supabase/functions/send-daily-summary/index.ts`.
// Re-exported from `src/lib/dailySummaryObservations.ts` so vitest can cover it.

export type ObservationType =
  | "quiet_day"
  | "big_spike"
  | "outlier_transaction"
  | "new_merchant"
  | "category_shift"
  | "zero_spend"
  | "streak_milestone"
  | "streak_broken"
  | "budget_ok_quiet";

export interface ExpenseLite {
  date: string; // YYYY-MM-DD
  amount: number;
  merchant_name?: string | null;
  category?: string | null;
}

export interface Observation {
  type: ObservationType;
  strength: number; // 0..100
  payload: Record<string, unknown>;
}

export interface ObservationContext {
  today: string; // YYYY-MM-DD (user local)
  isWeekend: boolean;
  /** Today's expenses, already filtered to exclude transfer/correction. */
  todayExpenses: ExpenseLite[];
  /** Last ~90 days (excluding today), already filtered. */
  history: ExpenseLite[];
  /** Current streak of days within daily budget (incl. today). 0 if no budget. */
  streakDays: number;
  /** Streak as of yesterday (used to detect a break). 0 if unknown. */
  prevStreakDays: number;
  /** Whether the user has any active monthly budget. */
  hasBudget: boolean;
}

export interface DailyState {
  last_observation_type?: ObservationType | null;
  last_observation_date?: string | null; // YYYY-MM-DD
  last_merchant_mentioned?: string | null;
}

const TIE_BREAK: Record<ObservationType, number> = {
  streak_broken: 8,
  outlier_transaction: 7,
  new_merchant: 6,
  big_spike: 5,
  quiet_day: 4,
  zero_spend: 3,
  category_shift: 2,
  streak_milestone: 9, // milestones almost always win
  budget_ok_quiet: 0,
};

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dayKey(d: string): string {
  // Accept both YYYY-MM-DD and full timestamp; return YYYY-MM-DD.
  return d.slice(0, 10);
}

function isWeekendYmd(ymd: string): boolean {
  const d = new Date(ymd + "T12:00:00Z");
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

function yesterdayOf(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function normalizeMerchant(name?: string | null): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return n.length > 0 ? n : null;
}

/** Sum per day for the given expenses. Returns Map<ymd, total>. */
function groupByDay(expenses: ExpenseLite[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of expenses) {
    const k = dayKey(e.date);
    m.set(k, (m.get(k) ?? 0) + Number(e.amount || 0));
  }
  return m;
}

export function computeObservations(ctx: ObservationContext): Observation[] {
  const out: Observation[] = [];
  const todayTotal = sum(ctx.todayExpenses.map((e) => Number(e.amount || 0)));

  // --- streak break / milestone ---
  if (ctx.hasBudget) {
    const MILESTONES = [7, 14, 30, 60, 100];
    if (MILESTONES.includes(ctx.streakDays)) {
      out.push({
        type: "streak_milestone",
        strength: 95,
        payload: { days: ctx.streakDays },
      });
    }
    if (ctx.prevStreakDays >= 7 && ctx.streakDays === 0) {
      out.push({
        type: "streak_broken",
        strength: 80,
        payload: { days: ctx.prevStreakDays },
      });
    }
  }

  // --- zero spend ---
  if (ctx.todayExpenses.length === 0) {
    // Only meaningful if the user usually spends — count days with spend in last 14.
    const last14 = groupByDay(
      ctx.history.filter((e) => e.date >= nDaysAgo(ctx.today, 14)),
    );
    const activeDays = [...last14.values()].filter((v) => v > 0).length;
    if (activeDays >= 7) {
      out.push({ type: "zero_spend", strength: 70, payload: {} });
    }
  }

  // --- quiet_day / big_spike (vs comparable-day-of-week average) ---
  // Use last 28 days, split weekday vs weekend, exclude today and zero-days.
  const last28Start = nDaysAgo(ctx.today, 28);
  const byDay = groupByDay(
    ctx.history.filter((e) => e.date >= last28Start && e.date < ctx.today),
  );
  const comparableTotals: number[] = [];
  for (const [ymd, total] of byDay.entries()) {
    if (total <= 0) continue;
    if (isWeekendYmd(ymd) === ctx.isWeekend) comparableTotals.push(total);
  }
  if (comparableTotals.length >= 5 && todayTotal > 0) {
    const avg = sum(comparableTotals) / comparableTotals.length;
    if (avg > 0) {
      const ratio = todayTotal / avg;
      if (ratio <= 0.5) {
        const pctLess = Math.round((1 - ratio) * 100);
        out.push({
          type: "quiet_day",
          strength: Math.min(80, 40 + pctLess), // 40-80
          payload: { todayTotal, avg, pctLess },
        });
      } else if (ratio >= 1.6) {
        const pctMore = Math.round((ratio - 1) * 100);
        out.push({
          type: "big_spike",
          strength: Math.min(85, 45 + Math.round(pctMore / 2)),
          payload: { todayTotal, avg, pctMore },
        });
      }
    }
  }

  // --- outlier_transaction (per merchant, last 90d) ---
  if (ctx.todayExpenses.length > 0) {
    // Build per-merchant history amounts.
    const histByMerchant = new Map<string, number[]>();
    for (const e of ctx.history) {
      const m = normalizeMerchant(e.merchant_name);
      if (!m) continue;
      const a = Number(e.amount || 0);
      if (a <= 0) continue;
      const arr = histByMerchant.get(m) ?? [];
      arr.push(a);
      histByMerchant.set(m, arr);
    }
    // All historical amounts for the "top 10%" fallback test.
    const allHist = ctx.history
      .map((e) => Number(e.amount || 0))
      .filter((a) => a > 0)
      .sort((a, b) => a - b);
    const top10Threshold = allHist.length >= 20
      ? allHist[Math.floor(allHist.length * 0.9)]
      : Infinity;

    let best: Observation | null = null;
    for (const e of ctx.todayExpenses) {
      const m = normalizeMerchant(e.merchant_name);
      if (!m) continue;
      const amount = Number(e.amount || 0);
      if (amount <= 0) continue;
      const hist = histByMerchant.get(m) ?? [];
      let isOutlier = false;
      let med = 0;
      if (hist.length >= 3) {
        med = median(hist);
        if (med > 0 && amount >= 3 * med) isOutlier = true;
      } else if (hist.length >= 1) {
        med = median(hist);
        if (med > 0 && amount >= 2 * med && amount >= top10Threshold) {
          isOutlier = true;
        }
      }
      if (isOutlier) {
        const ratio = med > 0 ? amount / med : 1;
        const strength = Math.min(90, 55 + Math.round(ratio * 5));
        if (!best || strength > best.strength) {
          best = {
            type: "outlier_transaction",
            strength,
            payload: {
              merchant: e.merchant_name,
              merchantKey: m,
              amount,
              median: med,
            },
          };
        }
      }
    }
    if (best) out.push(best);
  }

  // --- new_merchant ---
  if (ctx.todayExpenses.length > 0) {
    const seen = new Set<string>();
    for (const e of ctx.history) {
      const m = normalizeMerchant(e.merchant_name);
      if (m) seen.add(m);
    }
    let best: Observation | null = null;
    for (const e of ctx.todayExpenses) {
      const m = normalizeMerchant(e.merchant_name);
      if (!m || seen.has(m)) continue;
      const amount = Number(e.amount || 0);
      if (amount <= 0) continue;
      // Strength scales with amount vs today's biggest tx.
      const strength = 60 + Math.min(15, Math.round(amount / Math.max(1, todayTotal) * 15));
      if (!best || strength > best.strength) {
        best = {
          type: "new_merchant",
          strength,
          payload: { merchant: e.merchant_name, merchantKey: m, amount },
        };
      }
    }
    if (best) out.push(best);
  }

  // --- category_shift ---
  if (ctx.todayExpenses.length > 0 && todayTotal > 0) {
    const todayByCat = new Map<string, number>();
    for (const e of ctx.todayExpenses) {
      const c = (e.category ?? "").trim();
      if (!c) continue;
      todayByCat.set(c, (todayByCat.get(c) ?? 0) + Number(e.amount || 0));
    }
    let topCat = "";
    let topAmt = 0;
    for (const [c, a] of todayByCat.entries()) {
      if (a > topAmt) {
        topAmt = a;
        topCat = c;
      }
    }
    if (topCat && topAmt / todayTotal >= 0.4) {
      const monthStart = ctx.today.slice(0, 7) + "-01";
      const histByCat = new Map<string, number>();
      for (const e of ctx.history) {
        if (e.date < nDaysAgo(ctx.today, 30)) continue;
        if (e.date >= ctx.today) continue;
        const c = (e.category ?? "").trim();
        if (!c) continue;
        histByCat.set(c, (histByCat.get(c) ?? 0) + Number(e.amount || 0));
      }
      const ranked = [...histByCat.entries()].sort((a, b) => b[1] - a[1]);
      const top3 = new Set(ranked.slice(0, 3).map((r) => r[0]));
      if (ranked.length >= 3 && !top3.has(topCat)) {
        out.push({
          type: "category_shift",
          strength: 55,
          payload: {
            category: topCat,
            amount: topAmt,
            todayTotal,
            monthStart,
          },
        });
      }
    }
  }

  // --- fallback baseline ---
  out.push({
    type: "budget_ok_quiet",
    strength: 10,
    payload: { todayTotal },
  });

  return out;
}

function nDaysAgo(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function pickObservation(
  candidates: Observation[],
  state: DailyState,
  today: string,
): Observation {
  if (candidates.length === 0) {
    return { type: "budget_ok_quiet", strength: 10, payload: {} };
  }
  const yesterday = yesterdayOf(today);
  const isRecent = state.last_observation_date === yesterday;

  const scored = candidates.map((c) => {
    let score = c.strength;
    // Penalize same observation type as yesterday (unless very strong).
    if (
      isRecent &&
      state.last_observation_type === c.type &&
      c.strength < 80
    ) {
      score -= 30;
    }
    // Penalize same merchant mention as yesterday.
    const merchant = normalizeMerchant(
      (c.payload as { merchantKey?: string; merchant?: string }).merchantKey ??
        (c.payload as { merchant?: string }).merchant ?? null,
    );
    if (
      isRecent &&
      merchant &&
      state.last_merchant_mentioned &&
      merchant === normalizeMerchant(state.last_merchant_mentioned)
    ) {
      score -= 40;
    }
    return { c, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return TIE_BREAK[b.c.type] - TIE_BREAK[a.c.type];
  });

  return scored[0].c;
}
