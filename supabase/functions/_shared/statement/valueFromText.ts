/**
 * VRIJEDNOST IZ TEKSTA — datum transakcije dolazi iz SAMOG dokumenta.
 *
 * ZAŠTO: AI prepis zna zamijeniti dan i mjesec („14.09.2026." → 2026-04-14),
 * pa brana razdoblja izbaci posve valjanu stavku. Kad izvod ima tekstualni
 * sloj, datum ne treba prepisivati — on doslovno piše uz iznos.
 *
 * PRAVILO SPARIVANJA: sidro je IZNOS, nikad AI-datum (njemu upravo ne
 * vjerujemo). Redak je mjerodavan samo kad je JEDNOZNAČAN — točno jedan
 * neiskorišten redak nosi taj iznos. Više kandidata → ne pogađa se, ostaje
 * AI-datum i brana. Iskorišten redak se troši, pa dvije jednake uplate ne
 * mogu uzeti isti redak.
 *
 * Čist modul — bez mreže, bez Deno/Node API-ja. Testira se vitestom.
 */

import { amountTokens, lineHasAmount } from './rawLineMatch.ts';

export type DateSource = 'statement_text' | 'ai';

export interface StatementPeriodRange {
  readonly from: string;
  readonly to: string;
}

export interface ValueFromTextTx {
  readonly date?: unknown;
  readonly amount?: unknown;
}

export interface ValueFromTextResult {
  /** ISO datum preuzet iz teksta, ili `null` kad preuzimanje nije moguće. */
  readonly date: string | null;
  readonly dateSource: DateSource;
  /** Redak iz kojeg je datum preuzet (samo za dijagnostiku). */
  readonly matchedLine: string | null;
  /** Iznos je pronađen u tekstu izvoda — potvrda, ne preinaka. */
  readonly amountConfirmed: boolean;
}

const HR_MONTHS = [
  'sij', 'velj', 'ožu', 'ozu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro',
];

/** `ožu`/`ozu` dijele isti mjesec — indeks u kalendaru. */
const monthFromWord = (word: string): number | null => {
  const w = word.toLowerCase();
  const idx = HR_MONTHS.findIndex((m) => w.startsWith(m));
  if (idx < 0) return null;
  // 'ozu' je duplikat trećeg mjeseca; sve nakon njega pomiče se za jedan.
  if (idx <= 2) return idx + 1;
  return idx;
};

const isRealDate = (y: number, m: number, d: number): boolean => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const NUMERIC_RE = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/g;
const ISO_RE = /(\d{4})-(\d{2})-(\d{2})/g;
const WORD_RE = /(\d{1,2})\.\s*([A-Za-zČĆŽŠĐčćžšđ]{3,})\.?\s*(\d{4})/g;

/** Svi datumi u retku, redom pojavljivanja, bez ponavljanja. */
export function lineDates(line: string): string[] {
  const out: string[] = [];
  const push = (y: number, m: number, d: number) => {
    if (!isRealDate(y, m, d)) return;
    const value = iso(y, m, d);
    if (!out.includes(value)) out.push(value);
  };

  for (const m of line.matchAll(ISO_RE)) push(Number(m[1]), Number(m[2]), Number(m[3]));
  for (const m of line.matchAll(NUMERIC_RE)) push(Number(m[3]), Number(m[2]), Number(m[1]));
  for (const m of line.matchAll(WORD_RE)) {
    const month = monthFromWord(m[2]);
    if (month) push(Number(m[3]), month, Number(m[1]));
  }
  return out;
}

/** Prvi datum retka (ili onaj koji pada u razdoblje, kad ih je više). */
export function parseLineDate(
  line: string,
  period?: StatementPeriodRange | null,
): string | null {
  const dates = lineDates(line);
  if (dates.length === 0) return null;
  if (period) {
    const inPeriod = dates.find((d) => d >= period.from && d <= period.to);
    if (inPeriod) return inPeriod;
  }
  return dates[0];
}

/**
 * Za svaku transakciju pokuša preuzeti datum iz doslovnog retka izvoda.
 * Sparivanje ovisi ISKLJUČIVO o iznosu i jednoznačnosti — AI-datum se ne čita.
 */
export function applyTextValues(
  lines: readonly string[],
  txs: readonly ValueFromTextTx[],
  period?: StatementPeriodRange | null,
): ValueFromTextResult[] {
  const used = new Set<number>();

  return txs.map((tx) => {
    const fallback: ValueFromTextResult = {
      date: null,
      dateSource: 'ai',
      matchedLine: null,
      amountConfirmed: false,
    };
    const amount = typeof tx.amount === 'number' ? tx.amount : Number(tx.amount);
    if (!Number.isFinite(amount)) return fallback;
    const tokens = amountTokens(amount);
    if (tokens.length === 0) return fallback;

    const hits: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (used.has(i)) continue;
      if (lineHasAmount(lines[i], tokens)) hits.push(i);
      if (hits.length > 1) break; // nejednoznačno — dalje se ne traži
    }
    if (hits.length !== 1) {
      return { ...fallback, amountConfirmed: hits.length > 0 };
    }

    const index = hits[0];
    const date = parseLineDate(lines[index], period);
    if (!date) {
      return { date: null, dateSource: 'ai', matchedLine: lines[index], amountConfirmed: true };
    }
    used.add(index);
    return { date, dateSource: 'statement_text', matchedLine: lines[index], amountConfirmed: true };
  });
}
