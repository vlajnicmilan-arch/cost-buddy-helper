// Shared period preset → date range logic.
// Extracted from ReportsDialog so every report export uses identical ranges.
// Behaviour is a 1:1 copy of the original ReportsDialog implementation.

export type PeriodPreset =
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'last-year'
  | 'all'
  | 'custom';

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface PeriodPresetOptions {
  /** Custom range start (yyyy-mm-dd from a date input). */
  customStart?: string;
  /** Custom range end (yyyy-mm-dd from a date input). */
  customEnd?: string;
  /** Dataset used by the 'all' preset to find the earliest date. */
  dates?: Date[];
  /** Injectable "now" for deterministic tests. */
  now?: Date;
}

/** Preset keys offered in the export period picker, in display order. */
export const PERIOD_PRESET_OPTIONS: PeriodPreset[] = [
  'this-month',
  'last-month',
  'this-year',
  'last-year',
  'all',
  'custom',
];

/** i18n key + fallback label per preset (reused across dialogs). */
export const PERIOD_PRESET_LABELS: Record<PeriodPreset, { key: string; fallback: string }> = {
  'this-month': { key: 'reports.thisMonth', fallback: 'Ovaj mjesec' },
  'last-month': { key: 'reports.lastMonth', fallback: 'Prošli mjesec' },
  'this-year': { key: 'reports.thisYear', fallback: 'Ova godina' },
  'last-year': { key: 'reports.lastYear', fallback: 'Prošla godina' },
  all: { key: 'reports.allTime', fallback: 'Sve vrijeme' },
  custom: { key: 'reports.custom', fallback: 'Prilagođeno' },
};

export const resolvePeriodRange = (
  preset: PeriodPreset,
  options: PeriodPresetOptions = {},
): PeriodRange => {
  const now = options.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'this-month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: today };
    case 'last-month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0),
      };
    case 'this-year':
      return { start: new Date(now.getFullYear(), 0, 1), end: today };
    case 'last-year':
      return {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, 11, 31),
      };
    case 'all': {
      const times = (options.dates || []).map((d) => d.getTime());
      return {
        start: times.length > 0 ? new Date(Math.min(...times)) : today,
        end: today,
      };
    }
    case 'custom':
      return {
        start: options.customStart ? new Date(options.customStart) : today,
        end: options.customEnd ? new Date(options.customEnd) : today,
      };
    default:
      return { start: today, end: today };
  }
};

/** Inclusive day-level filter for a resolved range. */
export const isWithinPeriod = (date: Date, range: PeriodRange): boolean => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const s = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate()).getTime();
  const e = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate()).getTime();
  return d >= s && d <= e;
};
