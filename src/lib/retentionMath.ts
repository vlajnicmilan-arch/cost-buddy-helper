/**
 * Pure helpers for Cohort Retention Dashboard.
 * No React, no Supabase — fully unit-testable.
 */

export const SMALL_SAMPLE_THRESHOLD = 20;
export const RETENTION_WEEKS = 8;
export const FUNNEL_EVENTS = [
  'install',
  'signup',
  'onboarding_complete',
  'first_transaction',
  'day7_active',
  'paid_conversion',
] as const;
export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

export interface CohortRetentionRow {
  cohort_week: string;
  cohort_week_start: string;
  cohort_size: number;
  week_offset: number;
  retained_count: number;
  retained_pct: number | string;
}

export interface ActivationRow {
  cohort_week: string;
  cohort_week_start: string;
  cohort_size: number;
  activated_count: number;
  activated_pct: number | string;
  median_expenses_per_active: number | string;
}

export interface FunnelDayRow {
  day: string;
  event_name: string;
  cnt: number;
}

export interface CohortRow {
  cohortWeek: string;
  cohortStart: string;
  cohortSize: number;
  weeks: Array<{ count: number; pct: number }>;
}

export const isSmallSample = (size: number): boolean =>
  size < SMALL_SAMPLE_THRESHOLD;

const toNum = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Pivots long-format retention rows into one entry per cohort with 8 week cells. */
export const pivotCohortRows = (rows: CohortRetentionRow[]): CohortRow[] => {
  const byCohort = new Map<string, CohortRow>();

  for (const r of rows) {
    let entry = byCohort.get(r.cohort_week);
    if (!entry) {
      entry = {
        cohortWeek: r.cohort_week,
        cohortStart: r.cohort_week_start,
        cohortSize: r.cohort_size,
        weeks: Array.from({ length: RETENTION_WEEKS }, () => ({ count: 0, pct: 0 })),
      };
      byCohort.set(r.cohort_week, entry);
    }
    const w = r.week_offset;
    if (w >= 0 && w < RETENTION_WEEKS) {
      entry.weeks[w] = { count: r.retained_count, pct: toNum(r.retained_pct) };
    }
  }

  return Array.from(byCohort.values()).sort((a, b) =>
    a.cohortStart < b.cohortStart ? 1 : a.cohortStart > b.cohortStart ? -1 : 0,
  );
};

/**
 * Weighted average retention at a given week offset across cohorts with
 * sufficient sample size AND sufficient maturity (cohort old enough to have
 * reached that week).
 */
export const weightedRetentionAt = (
  cohorts: CohortRow[],
  weekOffset: number,
  now: Date = new Date(),
): { pct: number; cohortsUsed: number; usersTotal: number } => {
  if (weekOffset < 1 || weekOffset >= RETENTION_WEEKS) {
    return { pct: 0, cohortsUsed: 0, usersTotal: 0 };
  }
  let retainedSum = 0;
  let sizeSum = 0;
  let used = 0;
  const nowMs = now.getTime();

  for (const c of cohorts) {
    if (isSmallSample(c.cohortSize)) continue;
    const startMs = new Date(c.cohortStart + 'T00:00:00Z').getTime();
    const maturityMs = startMs + weekOffset * 7 * 86_400_000;
    if (maturityMs > nowMs) continue;
    retainedSum += c.weeks[weekOffset]?.count ?? 0;
    sizeSum += c.cohortSize;
    used += 1;
  }

  if (sizeSum === 0) return { pct: 0, cohortsUsed: used, usersTotal: 0 };
  return {
    pct: Math.round((retainedSum / sizeSum) * 1000) / 10,
    cohortsUsed: used,
    usersTotal: sizeSum,
  };
};

/**
 * Weighted activation percentage and combined median across all cohorts with
 * sufficient sample size. Median is approximated as weighted average of
 * per-cohort medians — surface this caveat in the UI tooltip.
 */
export const weightedActivation = (
  rows: ActivationRow[],
): {
  activatedPct: number;
  medianExpenses: number;
  cohortsUsed: number;
  usersTotal: number;
} => {
  let activatedSum = 0;
  let sizeSum = 0;
  let medianWeightedSum = 0;
  let activatedTotal = 0;
  let used = 0;

  for (const r of rows) {
    if (isSmallSample(r.cohort_size)) continue;
    activatedSum += r.activated_count;
    sizeSum += r.cohort_size;
    const median = toNum(r.median_expenses_per_active);
    medianWeightedSum += median * r.activated_count;
    activatedTotal += r.activated_count;
    used += 1;
  }

  return {
    activatedPct:
      sizeSum > 0 ? Math.round((activatedSum / sizeSum) * 1000) / 10 : 0,
    medianExpenses:
      activatedTotal > 0
        ? Math.round((medianWeightedSum / activatedTotal) * 10) / 10
        : 0,
    cohortsUsed: used,
    usersTotal: sizeSum,
  };
};

/** Groups funnel rows by event_name and produces a dense daily series. */
export const aggregateFunnel30d = (
  rows: FunnelDayRow[],
  days = 30,
  now: Date = new Date(),
): Array<{
  eventName: FunnelEventName;
  total: number;
  series: Array<{ day: string; cnt: number }>;
}> => {
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(todayUtc.getTime() - i * 86_400_000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const byEvent = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!byEvent.has(r.event_name)) byEvent.set(r.event_name, new Map());
    byEvent.get(r.event_name)!.set(r.day, (r.cnt ?? 0) | 0);
  }

  return FUNNEL_EVENTS.map((name) => {
    const m = byEvent.get(name) ?? new Map<string, number>();
    let total = 0;
    const series = dayKeys.map((day) => {
      const cnt = m.get(day) ?? 0;
      total += cnt;
      return { day, cnt };
    });
    return { eventName: name, total, series };
  });
};

/** Tailwind background opacity class for a retention percentage cell. */
export const heatmapBgClass = (pct: number): string => {
  if (pct <= 0) return 'bg-muted/40';
  if (pct < 10) return 'bg-primary/10';
  if (pct < 25) return 'bg-primary/20';
  if (pct < 40) return 'bg-primary/35';
  if (pct < 60) return 'bg-primary/55';
  if (pct < 80) return 'bg-primary/75';
  return 'bg-primary/90';
};

/** Text color for readability on top of heatmap cell. */
export const heatmapTextClass = (pct: number): string =>
  pct >= 60 ? 'text-primary-foreground' : 'text-foreground';

/**
 * Determines whether a (cohort, week_offset) cell represents a future window
 * that the cohort hasn't reached yet.
 */
export const isFutureCell = (
  cohortStart: string,
  weekOffset: number,
  now: Date = new Date(),
): boolean => {
  const startMs = new Date(cohortStart + 'T00:00:00Z').getTime();
  const cellStartMs = startMs + weekOffset * 7 * 86_400_000;
  return cellStartMs > now.getTime();
};

/** Pass-through cohort label (ISO week is unambiguous and matches DB output). */
export const formatCohortLabel = (iso: string): string => iso;
