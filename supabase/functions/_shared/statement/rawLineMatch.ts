/**
 * CITAT S IZVODA — deterministično pronalaženje DOSLOVNOG retka.
 *
 * AI prepis nije dokaz nego opet interpretacija. Zato citat izvlačimo iz teksta
 * koji već imamo: tekstualni sloj PDF-a (`text`) ili doslovni redak HTML tablice
 * (`html`). AI prepis (`ai`) ostaje samo za skenove bez tekstualnog sloja.
 *
 * Čist modul — bez mreže, bez Dena/Node API-ja. Testira se vitestom.
 */

export type RawLineSource = 'text' | 'html' | 'ai';

/** Gornja granica duljine citata — kartica retka i skica ostaju uredne. */
export const RAW_LINE_MAX_CHARS = 300;

export interface RawLineTx {
  /** ISO datum (YYYY-MM-DD) ili bilo koji parsabilan datum retka. */
  readonly date: string | null | undefined;
  readonly amount: number;
}

/** Nastavci Revolut-blokova — pripadaju istoj transakciji, ne novom retku. */
const CONTINUATION_PREFIXES = [
  'primatelj:', 'pošiljatelj:', 'posiljatelj:', 'kartica:', 'od:', 'za:',
  'iban:', 'poziv na broj', 'model', 'referenca', 'opis:', 'svrha',
];

const HR_MONTHS = [
  'sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro',
];

export function splitStatementLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Sve pisane varijante iznosa koje banke koriste (hr i en grupiranje). */
export function amountTokens(amount: number): string[] {
  const abs = Math.abs(Number(amount));
  if (!Number.isFinite(abs)) return [];
  const plain = abs.toFixed(2);                       // 1234.56
  const [intPart, dec] = plain.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');  // 1,234
  const groupedDot = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const out = new Set<string>([
    plain,                       // 1234.56
    `${intPart},${dec}`,         // 1234,56
    `${grouped}.${dec}`,         // 1,234.56
    `${groupedDot},${dec}`,      // 1.234,56
  ]);
  return Array.from(out);
}

function lineHasAmount(line: string, tokens: readonly string[]): boolean {
  return tokens.some((tok) => {
    const re = new RegExp(`(^|[^\\d])${escapeRe(tok)}($|[^\\d])`);
    return re.test(line);
  });
}

/** Datum retka u oblicima koje izvodi ispisuju (uklj. hrvatski „9. kol 2026."). */
export function dateTokens(iso: string | null | undefined): string[] {
  if (!iso) return [];
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const [, y, mm, dd] = m;
  const d = String(Number(dd));
  const mo = String(Number(mm));
  const month = HR_MONTHS[Number(mm) - 1] ?? '';
  return [
    `${y}-${mm}-${dd}`,
    `${dd}.${mm}.${y}`,
    `${d}.${mo}.${y}`,
    `${dd}/${mm}/${y}`,
    `${d}. ${month}`,
  ].filter(Boolean);
}

function lineHasDate(line: string, tokens: readonly string[]): boolean {
  const lower = line.toLowerCase();
  return tokens.some((tok) => lower.includes(tok.toLowerCase()));
}

function isContinuation(line: string): boolean {
  const lower = line.toLowerCase();
  return CONTINUATION_PREFIXES.some((p) => lower.startsWith(p));
}

function buildBlock(lines: readonly string[], start: number): string {
  let out = lines[start];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!isContinuation(lines[i])) break;
    const next = `${out} ${lines[i]}`;
    if (next.length > RAW_LINE_MAX_CHARS) break;
    out = next;
  }
  return out.length > RAW_LINE_MAX_CHARS ? `${out.slice(0, RAW_LINE_MAX_CHARS - 1).trimEnd()}…` : out;
}

/**
 * Za svaku transakciju vraća doslovni redak (ili null kad ga nema).
 * Sidra: iznos (obavezno) + datum (prednost). Redak se troši — dvije iste
 * uplate istog dana dobiju svoja dva različita retka, u redoslijedu izvoda.
 */
export function matchRawLines(
  lines: readonly string[],
  txs: readonly RawLineTx[],
): (string | null)[] {
  const used = new Set<number>();
  let cursor = 0;
  return txs.map((tx) => {
    const amounts = amountTokens(tx.amount);
    if (amounts.length === 0) return null;
    const dates = dateTokens(tx.date);

    const hits: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (used.has(i)) continue;
      if (lineHasAmount(lines[i], amounts)) hits.push(i);
    }
    if (hits.length === 0) return null;

    const withDate = dates.length > 0 ? hits.filter((i) => lineHasDate(lines[i], dates)) : [];
    const pool = withDate.length > 0 ? withDate : hits;
    const forward = pool.filter((i) => i >= cursor);
    const chosen = (forward.length > 0 ? forward : pool)[0];

    used.add(chosen);
    cursor = chosen + 1;
    return buildBlock(lines, chosen);
  });
}

/** Skraćivanje AI prepisa na istu granicu kao deterministički citat. */
export function capRawLine(value: string | null | undefined): string | null {
  const s = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > RAW_LINE_MAX_CHARS ? `${s.slice(0, RAW_LINE_MAX_CHARS - 1).trimEnd()}…` : s;
}
