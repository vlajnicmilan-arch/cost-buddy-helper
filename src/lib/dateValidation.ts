import { addDays, addYears, subYears, subDays } from 'date-fns';

/**
 * Centralized date validation rules per use case.
 * Prevents typos like year "2028" being entered as transaction date.
 */

export type DateContext =
  | 'expense'        // Past expense — max = today
  | 'income'         // Income — max = today + 1 month (scheduled salary)
  | 'recurring'      // Recurring/installment — max = today + 5y
  | 'debt'           // Debt due date — min = today, max = today + 10y
  | 'savings'        // Savings target — min = today, max = today + 20y
  | 'budget'         // Budget start/end — max = today + 5y
  | 'event'          // Calendar event — max = today + 5y
  | 'estimate'       // Estimate "valid until" — min = today, max = today + 5y
  | 'report'         // Report range — past only
  | 'transactionDynamic'; // Generic — caller passes type

export interface DateRange {
  min: Date;
  max: Date;
}

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

/**
 * Returns the allowed [min, max] range for a given context.
 */
export const getDateRange = (
  context: DateContext,
  txType?: 'expense' | 'income' | 'transfer'
): DateRange => {
  const today = startOfDay(new Date());

  switch (context) {
    case 'expense':
      return { min: subYears(today, 10), max: endOfDay(today) };
    case 'income':
      return { min: subYears(today, 10), max: endOfDay(addDays(today, 30)) };
    case 'recurring':
      return { min: subYears(today, 1), max: endOfDay(addYears(today, 5)) };
    case 'debt':
      return { min: today, max: endOfDay(addYears(today, 10)) };
    case 'savings':
      return { min: today, max: endOfDay(addYears(today, 20)) };
    case 'budget':
      return { min: subYears(today, 1), max: endOfDay(addYears(today, 5)) };
    case 'event':
      return { min: subYears(today, 1), max: endOfDay(addYears(today, 5)) };
    case 'estimate':
      return { min: today, max: endOfDay(addYears(today, 5)) };
    case 'report':
      return { min: new Date('1900-01-01'), max: endOfDay(today) };
    case 'transactionDynamic':
      if (txType === 'income') return getDateRange('income');
      if (txType === 'transfer') return getDateRange('expense'); // transfers behave like expenses
      return getDateRange('expense');
  }
};

/**
 * Format a Date to "yyyy-MM-dd" for native <input type="date"> min/max.
 */
export const toInputDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Returns true when value is inside [min, max].
 * Accepts ISO string ("yyyy-MM-dd") or Date.
 */
export const isDateInRange = (value: string | Date, range: DateRange): boolean => {
  if (!value) return true;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return false;
  return d.getTime() >= range.min.getTime() && d.getTime() <= range.max.getTime();
};

/**
 * Clamps a date string/Date to [min, max]. Returns the clamped ISO date string.
 */
export const clampInputDate = (value: string, range: DateRange): string => {
  if (!value) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return toInputDate(range.max);
  if (d.getTime() < range.min.getTime()) return toInputDate(range.min);
  if (d.getTime() > range.max.getTime()) return toInputDate(range.max);
  return value;
};

/**
 * Calendar `disabled` predicate for shadcn Calendar component.
 */
export const makeCalendarDisabled = (range: DateRange) => (date: Date) =>
  date.getTime() < range.min.getTime() || date.getTime() > range.max.getTime();

/**
 * Picks the most relevant i18n key based on which boundary was crossed.
 */
export const getDateValidationKey = (
  value: string | Date,
  range: DateRange
): 'validation.dateInFuture' | 'validation.dateTooFar' | 'validation.dateOutOfRange' | null => {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return 'validation.dateOutOfRange';
  if (d.getTime() > range.max.getTime()) {
    const today = startOfDay(new Date());
    return d.getTime() > today.getTime() ? 'validation.dateInFuture' : 'validation.dateTooFar';
  }
  if (d.getTime() < range.min.getTime()) return 'validation.dateTooFar';
  return null;
};
