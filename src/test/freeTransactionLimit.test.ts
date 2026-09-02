import { describe, expect, it } from 'vitest';
import { getFreeTransactionLimitPeriod } from '@/lib/freeTransactionLimit';

describe('free transaction limit period', () => {
  it('formats the current month and next-month reset date in Croatian', () => {
    expect(getFreeTransactionLimitPeriod('hr', new Date(2026, 7, 15))).toEqual({
      month: 'kolovoz',
      resetDate: '1. rujna 2026.',
    });
  });

  it('formats the period for English and German users', () => {
    expect(getFreeTransactionLimitPeriod('en', new Date(2026, 7, 15))).toEqual({
      month: 'August',
      resetDate: 'September 1, 2026',
    });
    expect(getFreeTransactionLimitPeriod('de', new Date(2026, 7, 15))).toEqual({
      month: 'August',
      resetDate: '1. September 2026',
    });
  });
});
