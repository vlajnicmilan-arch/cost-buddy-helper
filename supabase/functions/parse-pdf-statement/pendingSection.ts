/**
 * BLOK REZERVACIJA („Na čekanju" / „Pending") — ne ulazi u knjige.
 *
 * Izvodi poput Revolutovog imaju DVA odjeljka: rezervacije (bez stupca salda)
 * i proknjiženi promet (sa saldom). Ista kupnja se pojavi u oba, pa bez ovog
 * čitanja uđe dvaput. Ovdje se blok prepoznaje po zaglavlju odjeljka i po
 * ODSUTNOSTI stupca salda u njegovoj tablici.
 *
 * Dvije brane da se ne ugasi uvoz bankama bez salda (npr. KEKS):
 *  1. pravilo se primjenjuje SAMO ako izvod uopće ima saldo po retku,
 *  2. označava se samo redak koji NEMA saldo i pripada prepoznatom bloku.
 *
 * Čist modul — bez mreže i bez Deno/Node API-ja. Testira se vitestom.
 */

import { amountTokens, dateTokens, isRowContinuation } from '../_shared/statement/rawLineMatch.ts';

/** Zaglavlje odjeljka rezervacija (hr / en / de dijalekti). */
const PENDING_HEADER =
  /(na\s+[čc]ekanju|u\s+obradi|\bpending\b|ausstehend|vorgemerkt|schwebend|nicht\s+gebucht)/i;

/** Zaglavlje proknjiženog odjeljka — zatvara blok rezervacija. */
const BOOKED_HEADER =
  /(transakcije\s+po\s+ra[čc]unu|promet\s+po\s+ra[čc]unu|proknji[žz]en|\bbooked\b|\btransactions\b|kontoums[äa]tze|\bums[äa]tze\b|\bbuchungen\b)/i;

const BALANCE_WORD = /(saldo|stanje|balance|kontostand)/i;
const DESC_WORD = /(opis|description|beschreibung|verwendungszweck)/i;
const DATE_WORD = /(datum|date)/i;

/** Najdulje zaglavlje odjeljka — dulje od toga je rečenica, ne naslov. */
const HEADING_MAX_CHARS = 120;
/** Koliko redaka poslije naslova tražimo zaglavlje stupaca. */
const COLUMN_HEADER_LOOKAHEAD = 5;

export interface PendingRange {
  /** Prvi redak bloka (naslov odjeljka), uključivo. */
  readonly start: number;
  /** Zadnji redak bloka, uključivo. */
  readonly end: number;
}

function isColumnHeader(line: string): boolean {
  return DATE_WORD.test(line) && DESC_WORD.test(line);
}

/** Rasponi redaka koji pripadaju odjeljku rezervacija. */
export function detectPendingRanges(lines: readonly string[]): PendingRange[] {
  const ranges: PendingRange[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > HEADING_MAX_CHARS) continue;
    if (!PENDING_HEADER.test(line)) continue;
    if (isColumnHeader(line)) continue;

    // Potvrda: tablica ispod naslova NEMA stupac salda.
    let confirmed = false;
    for (let j = i + 1; j <= Math.min(i + COLUMN_HEADER_LOOKAHEAD, lines.length - 1); j += 1) {
      if (!isColumnHeader(lines[j])) continue;
      confirmed = !BALANCE_WORD.test(lines[j]);
      break;
    }
    if (!confirmed) continue;

    let end = lines.length - 1;
    for (let j = i + 2; j < lines.length; j += 1) {
      if (BOOKED_HEADER.test(lines[j]) || (isColumnHeader(lines[j]) && BALANCE_WORD.test(lines[j]))) {
        end = j - 1;
        break;
      }
    }
    ranges.push({ start: i, end });
    i = end;
  }
  return ranges;
}

export interface PendingTx {
  readonly date: string | null | undefined;
  readonly amount: number;
  readonly balance_after?: number | null;
}

function lineHasToken(line: string, tokens: readonly string[]): boolean {
  const lower = line.toLowerCase();
  return tokens.some((tok) => lower.includes(tok.toLowerCase()));
}

function lineHasAmount(line: string, tokens: readonly string[]): boolean {
  return tokens.some((tok) => {
    const re = new RegExp(`(^|[^\\d])${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\d])`);
    return re.test(line);
  });
}

/**
 * Za svaku transakciju vraća `true` ako pripada bloku rezervacija.
 * Pravilo se NE primjenjuje na izvode bez salda ni za jedan redak.
 */
export function markPendingTransactions(
  lines: readonly string[],
  txs: readonly PendingTx[],
): boolean[] {
  const out = txs.map(() => false);
  const hasAnyBalance = txs.some((t) => typeof t.balance_after === 'number' && Number.isFinite(t.balance_after));
  if (!hasAnyBalance) return out;

  const ranges = detectPendingRanges(lines);
  if (ranges.length === 0) return out;

  // Početni redci transakcija unutar blokova rezervacija (nastavci ne broje).
  const pendingLines: number[] = [];
  for (const r of ranges) {
    for (let i = r.start + 1; i <= r.end; i += 1) {
      const line = lines[i];
      if (!line || isRowContinuation(line) || isColumnHeader(line)) continue;
      pendingLines.push(i);
    }
  }
  if (pendingLines.length === 0) return out;

  const used = new Set<number>();
  txs.forEach((tx, idx) => {
    if (typeof tx.balance_after === 'number' && Number.isFinite(tx.balance_after)) return;
    const amounts = amountTokens(tx.amount);
    if (amounts.length === 0) return;
    const dates = dateTokens(tx.date);
    const hits = pendingLines.filter((i) => !used.has(i) && lineHasAmount(lines[i], amounts));
    if (hits.length === 0) return;
    const withDate = dates.length > 0 ? hits.filter((i) => lineHasToken(lines[i], dates)) : [];
    const chosen = (withDate.length > 0 ? withDate : hits)[0];
    used.add(chosen);
    out[idx] = true;
  });
  return out;
}
