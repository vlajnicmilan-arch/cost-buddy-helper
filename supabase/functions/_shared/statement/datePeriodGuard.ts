/**
 * BRANA NA DATUM STAVKE — razdoblje izvatka je jedini sudac.
 *
 * ZAŠTO: model sam preračunava hrvatski oblik („02.09.2026.") u ISO i zna
 * zamijeniti dan i mjesec (2026-02-09). Takav datum je valjan kalendarski
 * datum, pa ga nijedna postojeća provjera ne hvata.
 *
 * Razdoblje izvatka (`period_from`/`period_to`) čita se DETERMINISTIČKI, bez
 * AI-ja. Ovdje se samo uspoređuje: ako datum pada u razdoblje — prolazi; ako
 * ne pada, a zamjena dana i mjeseca pada — koristi se zamijenjeni; inače se
 * stavka zaustavlja. Zamjena dana i mjeseca je JEDINA dopuštena preinaka.
 *
 * Bez upotrebljivog razdoblja brana se ne aktivira — razdoblje se ne izmišlja.
 */

export interface StatementPeriod {
  from: string;
  to: string;
}

export type DateGuardVerdict =
  | { kind: 'ok' }
  | { kind: 'corrected'; date: string }
  | { kind: 'blocked'; swapped: string | null };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRealDate = (y: number, m: number, d: number): boolean => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const parseIso = (value: unknown): { y: number; m: number; d: number } | null => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(ISO_RE);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return isRealDate(y, m, d) ? { y, m, d } : null;
};

/** Razdoblje je upotrebljivo samo ako su oba ruba valjani ISO datumi i `from <= to`. */
export function normalizePeriod(
  from: unknown,
  to: unknown,
): StatementPeriod | null {
  const a = parseIso(from);
  const b = parseIso(to);
  if (!a || !b) return null;
  const fromIso = (from as string).trim();
  const toIso = (to as string).trim();
  if (fromIso > toIso) return null;
  return { from: fromIso, to: toIso };
}

/** `2026-02-09` → `2026-09-02`; nemoguća zamjena (npr. dan 13+) vraća null. */
export function swapDayMonth(value: unknown): string | null {
  const parsed = parseIso(value);
  if (!parsed) return null;
  const { y, m, d } = parsed;
  if (m === d) return null;
  if (!isRealDate(y, d, m)) return null;
  return `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
}

const inPeriod = (iso: string, period: StatementPeriod): boolean =>
  iso >= period.from && iso <= period.to;

export function guardStatementDate(
  date: unknown,
  period: StatementPeriod,
): DateGuardVerdict {
  const parsed = parseIso(date);
  if (!parsed) return { kind: 'ok' };
  const iso = (date as string).trim();
  if (inPeriod(iso, period)) return { kind: 'ok' };
  const swapped = swapDayMonth(iso);
  if (swapped && inPeriod(swapped, period)) return { kind: 'corrected', date: swapped };
  return { kind: 'blocked', swapped };
}

export interface DateGuardCorrection {
  index: number;
  original: string;
  corrected: string;
  description: string | null;
  amount: number | null;
}

export interface DateGuardBlock {
  index: number;
  original: string;
  swapped: string | null;
  description: string | null;
  amount: number | null;
}

export interface DateGuardOutcome<T> {
  /** Retci koji smiju u knjige (zaustavljeni su izbačeni, ispravljeni imaju novi datum). */
  rows: T[];
  corrections: DateGuardCorrection[];
  blocked: DateGuardBlock[];
  period: StatementPeriod | null;
}

/**
 * Primijeni branu na sve retke. Bez upotrebljivog razdoblja vraća ulaz
 * nepromijenjen (ponašanje kao dosad).
 */
export function guardStatementDates<
  T extends { date?: unknown; description?: unknown; amount?: unknown },
>(rows: readonly T[], period: StatementPeriod | null): DateGuardOutcome<T> {
  if (!period) return { rows: [...rows], corrections: [], blocked: [], period: null };

  const kept: T[] = [];
  const corrections: DateGuardCorrection[] = [];
  const blocked: DateGuardBlock[] = [];

  rows.forEach((row, index) => {
    const original = typeof row.date === 'string' ? row.date.trim() : '';
    const description = typeof row.description === 'string' ? row.description : null;
    const amount = typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : null;
    const verdict = guardStatementDate(row.date, period);

    if (verdict.kind === 'ok') {
      kept.push(row);
      return;
    }
    if (verdict.kind === 'corrected') {
      corrections.push({ index, original, corrected: verdict.date, description, amount });
      kept.push({ ...row, date: verdict.date, date_corrected_from: original } as T);
      return;
    }
    blocked.push({ index, original, swapped: verdict.swapped, description, amount });
  });

  return { rows: kept, corrections, blocked, period };
}
