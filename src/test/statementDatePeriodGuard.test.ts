import { describe, it, expect } from 'vitest';
import {
  guardStatementDate,
  guardStatementDates,
  normalizePeriod,
  swapDayMonth,
} from '../../supabase/functions/_shared/statement/datePeriodGuard.ts';
import { detectPeriodRange } from '../../supabase/functions/_shared/mailImport/statementSignals.ts';

const period = normalizePeriod('2026-09-02', '2026-09-03')!;

describe('brana na datum stavke', () => {
  it('datum u razdoblju prolazi nepromijenjen', () => {
    expect(guardStatementDate('2026-09-02', period)).toEqual({ kind: 'ok' });
  });

  it('zamijenjeni dan i mjesec se ispravljaju', () => {
    expect(guardStatementDate('2026-02-09', period)).toEqual({
      kind: 'corrected',
      date: '2026-09-02',
    });
  });

  it('datum koji ni zamjenom ne stane u okno se zaustavlja', () => {
    expect(guardStatementDate('2026-05-20', period)).toEqual({ kind: 'blocked', swapped: null });
  });

  it('datum valute par dana izvan razdoblja prolazi (okno ±7 dana)', () => {
    const daily = normalizePeriod('2026-08-17', '2026-08-17')!;
    expect(guardStatementDate('2026-08-16', daily)).toEqual({ kind: 'ok' });
    expect(guardStatementDate('2026-08-24', daily)).toEqual({ kind: 'ok' });
    expect(guardStatementDate('2026-08-25', daily)).toEqual({ kind: 'blocked', swapped: null });
  });

  it('bez razdoblja brana miruje', () => {
    const out = guardStatementDates([{ date: '2026-02-09' }], null);
    expect(out.rows).toEqual([{ date: '2026-02-09' }]);
    expect(out.corrections).toHaveLength(0);
  });

  it('zamjena je jedina dopuštena preinaka', () => {
    expect(swapDayMonth('2026-09-13')).toBeNull();
    expect(swapDayMonth('2026-02-09')).toBe('2026-09-02');
  });

  it('zaustavljene stavke ne ulaze u knjige', () => {
    const out = guardStatementDates(
      [
        { date: '2026-09-03', description: 'A', amount: 1 },
        { date: '2026-02-09', description: 'B', amount: 2 },
        { date: '2025-01-01', description: 'C', amount: 3 },
      ],
      period,
    );
    expect(out.rows.map((r) => r.date)).toEqual(['2026-09-03', '2026-09-02']);
    expect(out.corrections).toHaveLength(1);
    expect(out.blocked).toHaveLength(1);
    expect(out.blocked[0].description).toBe('C');
  });
});

describe('detectPeriodRange na stvarnim Erste zaglavljima', () => {
  it('mjesečno zaglavlje s "do" daje puni raspon', () => {
    expect(
      detectPeriodRange('Za razdoblje (po datumu obrade): 01.08.2026. do 31.08.2026.'),
    ).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('dnevno zaglavlje ostaje jednodnevno', () => {
    expect(detectPeriodRange('Za razdoblje (po datumu obrade): 17.08.2026.')).toEqual({
      from: '2026-08-17',
      to: '2026-08-17',
    });
  });
});
