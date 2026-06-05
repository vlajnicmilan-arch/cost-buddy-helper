import { describe, it, expect } from 'vitest';
import {
  pivotCohortRows,
  weightedRetentionAt,
  weightedActivation,
  aggregateFunnel30d,
  heatmapBgClass,
  heatmapTextClass,
  isFutureCell,
  isSmallSample,
  RETENTION_WEEKS,
  type CohortRetentionRow,
  type ActivationRow,
  type FunnelDayRow,
} from '../retentionMath';

describe('isSmallSample', () => {
  it('returns true under threshold', () => {
    expect(isSmallSample(0)).toBe(true);
    expect(isSmallSample(19)).toBe(true);
  });
  it('returns false at/above threshold', () => {
    expect(isSmallSample(20)).toBe(false);
    expect(isSmallSample(100)).toBe(false);
  });
});

describe('pivotCohortRows', () => {
  it('fills 8 weeks per cohort, defaulting missing weeks to 0', () => {
    const rows: CohortRetentionRow[] = [
      { cohort_week: '2026-W20', cohort_week_start: '2026-05-11', cohort_size: 30, week_offset: 0, retained_count: 30, retained_pct: 100 },
      { cohort_week: '2026-W20', cohort_week_start: '2026-05-11', cohort_size: 30, week_offset: 1, retained_count: 15, retained_pct: 50 },
    ];
    const out = pivotCohortRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].weeks).toHaveLength(RETENTION_WEEKS);
    expect(out[0].weeks[0]).toEqual({ count: 30, pct: 100 });
    expect(out[0].weeks[1]).toEqual({ count: 15, pct: 50 });
    expect(out[0].weeks[2]).toEqual({ count: 0, pct: 0 });
  });

  it('coerces stringified pct values', () => {
    const rows: CohortRetentionRow[] = [
      { cohort_week: '2026-W20', cohort_week_start: '2026-05-11', cohort_size: 10, week_offset: 0, retained_count: 10, retained_pct: '100.0' },
    ];
    expect(pivotCohortRows(rows)[0].weeks[0].pct).toBe(100);
  });

  it('sorts cohorts descending by start date', () => {
    const rows: CohortRetentionRow[] = [
      { cohort_week: '2026-W19', cohort_week_start: '2026-05-04', cohort_size: 10, week_offset: 0, retained_count: 10, retained_pct: 100 },
      { cohort_week: '2026-W21', cohort_week_start: '2026-05-18', cohort_size: 10, week_offset: 0, retained_count: 10, retained_pct: 100 },
      { cohort_week: '2026-W20', cohort_week_start: '2026-05-11', cohort_size: 10, week_offset: 0, retained_count: 10, retained_pct: 100 },
    ];
    expect(pivotCohortRows(rows).map(c => c.cohortWeek)).toEqual(['2026-W21', '2026-W20', '2026-W19']);
  });

  it('returns empty for empty input', () => {
    expect(pivotCohortRows([])).toEqual([]);
  });
});

describe('weightedRetentionAt', () => {
  const now = new Date('2026-06-05T00:00:00Z');

  it('returns 0 for offset out of range', () => {
    expect(weightedRetentionAt([], 0, now).pct).toBe(0);
    expect(weightedRetentionAt([], 8, now).pct).toBe(0);
  });

  it('ignores cohorts below sample threshold', () => {
    const cohorts = pivotCohortRows([
      { cohort_week: '2026-W19', cohort_week_start: '2026-05-04', cohort_size: 10, week_offset: 1, retained_count: 5, retained_pct: 50 },
    ]);
    const res = weightedRetentionAt(cohorts, 1, now);
    expect(res.cohortsUsed).toBe(0);
    expect(res.pct).toBe(0);
  });

  it('ignores immature cohorts', () => {
    const cohorts = pivotCohortRows([
      { cohort_week: '2026-W23', cohort_week_start: '2026-06-01', cohort_size: 50, week_offset: 0, retained_count: 50, retained_pct: 100 },
    ]);
    const res = weightedRetentionAt(cohorts, 1, now);
    expect(res.cohortsUsed).toBe(0);
  });

  it('weights by cohort size across mature cohorts', () => {
    const cohorts = pivotCohortRows([
      { cohort_week: '2026-W18', cohort_week_start: '2026-04-27', cohort_size: 100, week_offset: 1, retained_count: 50, retained_pct: 50 },
      { cohort_week: '2026-W19', cohort_week_start: '2026-05-04', cohort_size: 50, week_offset: 1, retained_count: 10, retained_pct: 20 },
    ]);
    const res = weightedRetentionAt(cohorts, 1, now);
    expect(res.pct).toBe(40);
    expect(res.cohortsUsed).toBe(2);
    expect(res.usersTotal).toBe(150);
  });
});

describe('weightedActivation', () => {
  it('ignores small samples', () => {
    const rows: ActivationRow[] = [
      { cohort_week: '2026-W20', cohort_week_start: '2026-05-11', cohort_size: 10, activated_count: 5, activated_pct: 50, median_expenses_per_active: 8 },
    ];
    expect(weightedActivation(rows).cohortsUsed).toBe(0);
  });

  it('computes weighted activation and median across cohorts', () => {
    const rows: ActivationRow[] = [
      { cohort_week: '2026-W18', cohort_week_start: '2026-04-27', cohort_size: 100, activated_count: 40, activated_pct: 40, median_expenses_per_active: 10 },
      { cohort_week: '2026-W19', cohort_week_start: '2026-05-04', cohort_size: 50, activated_count: 30, activated_pct: 60, median_expenses_per_active: 4 },
    ];
    const res = weightedActivation(rows);
    expect(res.activatedPct).toBe(46.7);
    expect(res.medianExpenses).toBe(7.4);
    expect(res.cohortsUsed).toBe(2);
    expect(res.usersTotal).toBe(150);
  });

  it('handles zero activations safely', () => {
    const rows: ActivationRow[] = [
      { cohort_week: '2026-W18', cohort_week_start: '2026-04-27', cohort_size: 50, activated_count: 0, activated_pct: 0, median_expenses_per_active: 0 },
    ];
    const res = weightedActivation(rows);
    expect(res.activatedPct).toBe(0);
    expect(res.medianExpenses).toBe(0);
  });
});

describe('aggregateFunnel30d', () => {
  const now = new Date('2026-06-05T12:00:00Z');

  it('produces dense 30-day series for all 6 events', () => {
    const rows: FunnelDayRow[] = [
      { day: '2026-06-05', event_name: 'signup', cnt: 3 },
      { day: '2026-06-04', event_name: 'signup', cnt: 2 },
      { day: '2026-06-05', event_name: 'install', cnt: 10 },
    ];
    const out = aggregateFunnel30d(rows, 30, now);
    expect(out).toHaveLength(6);
    const signup = out.find(o => o.eventName === 'signup')!;
    expect(signup.series).toHaveLength(30);
    expect(signup.total).toBe(5);
    expect(signup.series[29]).toEqual({ day: '2026-06-05', cnt: 3 });
    expect(signup.series[28]).toEqual({ day: '2026-06-04', cnt: 2 });
    expect(signup.series[0].cnt).toBe(0);
  });

  it('returns all events with zero totals when input empty', () => {
    const out = aggregateFunnel30d([], 30, now);
    expect(out).toHaveLength(6);
    expect(out.every(o => o.total === 0)).toBe(true);
    expect(out.every(o => o.series.length === 30)).toBe(true);
  });
});

describe('heatmap helpers', () => {
  it('returns muted for 0%', () => {
    expect(heatmapBgClass(0)).toBe('bg-muted/40');
  });
  it('scales primary opacity by pct buckets', () => {
    expect(heatmapBgClass(5)).toBe('bg-primary/10');
    expect(heatmapBgClass(15)).toBe('bg-primary/20');
    expect(heatmapBgClass(30)).toBe('bg-primary/35');
    expect(heatmapBgClass(50)).toBe('bg-primary/55');
    expect(heatmapBgClass(70)).toBe('bg-primary/75');
    expect(heatmapBgClass(95)).toBe('bg-primary/90');
  });
  it('uses primary-foreground text on dark cells', () => {
    expect(heatmapTextClass(70)).toBe('text-primary-foreground');
    expect(heatmapTextClass(30)).toBe('text-foreground');
  });
});

describe('isFutureCell', () => {
  const now = new Date('2026-06-05T00:00:00Z');
  it('marks cells whose week start is after now as future', () => {
    expect(isFutureCell('2026-06-01', 1, now)).toBe(true);
    expect(isFutureCell('2026-06-01', 0, now)).toBe(false);
  });
  it('past cohort cells are not future', () => {
    expect(isFutureCell('2026-04-27', 5, now)).toBe(false);
  });
});
