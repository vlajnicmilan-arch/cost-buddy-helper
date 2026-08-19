/**
 * SEGMENTIRANO ČITANJE VELIKIH IZVODA.
 *
 * Veliki PDF (Revolut, 14 stranica) u JEDNOM AI pozivu udara u 140 s strop i
 * posao padne s `ai_timeout_after_140s`. Zato se tekst dijeli na blokove, svaki
 * blok ide u zaseban AI poziv unutar iste vremenske granice, a redci se spajaju
 * redoslijedom.
 *
 * ŽELJEZNA PRAVILA:
 * - Šav NIKAD ne siječe transakcijski redak: granica bloka smije biti samo na
 *   retku koji nije nastavak (`isRowContinuation` iz `rawLineMatch`).
 * - Redak pripada TOČNO jednom bloku → duplikati na šavovima su nemogući,
 *   a unija blokova je cijeli tekst (`assertPartition` u testu).
 * - Blok koji vrati manje redaka nego što ih vidljivo ima = GLASAN pad s
 *   imenom bloka, nikad tihi djelomični rezultat.
 *
 * Čist modul — bez mreže i Deno/Node API-ja. Testira se vitestom.
 */

import { isRowContinuation, splitStatementLines } from './rawLineMatch.ts';

/** Ispod ovog praga izvod ostaje JEDAN poziv (Erste/OTP/KEKS regresije netaknute). */
export const SEGMENT_THRESHOLD_CHARS = 12_000;

/** Ciljana veličina bloka; stvarni blok se produlji do prvog dopuštenog šava. */
export const SEGMENT_TARGET_CHARS = 6_000;

/** Koliko redaka zaglavlja ide kao kontekst uz SVAKI blok (samo orijentacija). */
export const HEADER_CONTEXT_LINES = 12;

/** Blok smije vratiti najmanje ovoliki udio vidljivih redaka, inače je pad. */
export const MIN_BLOCK_YIELD_RATIO = 0.5;

const DATE_RE =
  /(\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\.\s*(sij|velj|ožu|ozu|tra|svi|lip|srp|kol|ruj|lis|stu|pro)\b)/i;
const AMOUNT_RE = /\d[\d.\s]*[.,]\d{2}\b/;

export interface StatementBlock {
  /** 1-bazirani redni broj bloka. */
  readonly index: number;
  readonly total: number;
  /** Ime bloka za poruke o pogrešci i napredak („blok 3/7"). */
  readonly label: string;
  readonly lines: readonly string[];
  /** Koliko redaka bloka izgleda kao transakcija (datum + iznos). */
  readonly candidateRows: number;
}

export function shouldSegment(text: string | null | undefined): boolean {
  return (text ?? '').length >= SEGMENT_THRESHOLD_CHARS;
}

export function isCandidateRow(line: string): boolean {
  if (!line || isRowContinuation(line)) return false;
  return DATE_RE.test(line) && AMOUNT_RE.test(line);
}

export function countCandidateRows(lines: readonly string[]): number {
  return lines.reduce((n, line) => (isCandidateRow(line) ? n + 1 : n), 0);
}

/**
 * Kratko zaglavlje-kontekst uz svaki blok: valuta, primjer formata datuma i
 * prvih nekoliko redaka zaglavlja. Kontekst je SAMO orijentacija — čitač iz
 * njega ne smije vaditi transakcije (blok 1 ionako sadrži te iste retke).
 */
export function buildBlockContext(lines: readonly string[]): string {
  const head = lines.slice(0, HEADER_CONTEXT_LINES);
  const currency = (lines.find((l) => /€|EUR|USD|\$|HRK|BAM|CHF/.test(l)) ?? '').match(
    /€|EUR|USD|\$|HRK|BAM|CHF/,
  )?.[0] ?? null;
  const dateSample = lines.find((l) => isCandidateRow(l))?.match(DATE_RE)?.[0] ?? null;
  return [
    'KONTEKST IZVODA (samo orijentacija — NE izvlači transakcije iz ovog bloka teksta):',
    currency ? `Valuta: ${currency}` : '',
    dateSample ? `Format datuma na izvodu: ${dateSample}` : '',
    `Zaglavlje: ${head.join(' | ').slice(0, 600)}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/**
 * Dijeli retke izvoda u blokove. Granica se postavlja tek kad je blok dosegao
 * ciljanu veličinu I sljedeći redak nije nastavak prethodnog retka.
 */
export function segmentStatementLines(
  lines: readonly string[],
  targetChars: number = SEGMENT_TARGET_CHARS,
): StatementBlock[] {
  if (lines.length === 0) return [];
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const boundaryAllowed = current.length > 0 && size >= targetChars && !isRowContinuation(line);
    if (boundaryAllowed) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length > 0) chunks.push(current);

  return chunks.map((chunkLines, i) => ({
    index: i + 1,
    total: chunks.length,
    label: `blok ${i + 1}/${chunks.length}`,
    lines: chunkLines,
    candidateRows: countCandidateRows(chunkLines),
  }));
}

export function segmentStatementText(
  text: string | null | undefined,
  targetChars: number = SEGMENT_TARGET_CHARS,
): StatementBlock[] {
  return segmentStatementLines(splitStatementLines(text), targetChars);
}

/** Tekst bloka koji ide AI-ju: kontekst + numerirani redci bloka. */
export function buildBlockPayload(block: StatementBlock, context: string): string {
  const rows = block.lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
  return [
    context,
    '',
    `DIO IZVODA ${block.label} — obradi ISKLJUČIVO retke ispod i vrati SVE transakcije iz njih.`,
    `Vidljivih transakcijskih redaka u ovom dijelu: ~${block.candidateRows}.`,
    '',
    rows,
  ].join('\n');
}

/**
 * POSTKONDICIJA PO BLOKU: vraća poruku greške kad je blok vratio premalo
 * redaka, `null` kad je blok prihvatljiv.
 */
export function blockYieldFailure(block: StatementBlock, returned: number): string | null {
  if (block.candidateRows === 0) return null;
  const minimum = Math.max(1, Math.ceil(block.candidateRows * MIN_BLOCK_YIELD_RATIO));
  if (returned < minimum) {
    return `parse_incomplete: ${block.label} vratio ${returned} od ~${block.candidateRows} redaka`;
  }
  return null;
}
