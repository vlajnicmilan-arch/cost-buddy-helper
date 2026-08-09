// MAIL UVOZ — VETO KORAK 2b: „ovo je BANKOVNI IZVOD, ne račun".
//
// Izvod banke koja je već poznat pošiljatelj/OIB inače propada kroz korak 3
// (heuristika) i tvrdo postaje `racun` — pa se saldo računa knjiži kao iznos
// računa. Zato ovaj korak ide PRIJE svega osim XML/UBL-a i verifikacije.
//
// Načelo: ≥2 sidrena signala = `izvod`. 0–1 signal = `nepoznato` s
// `needsHumanChoice` — NIKAD tiho `racun`.

export interface StatementExtraction {
  bank_name: string | null;
  account_iban: string | null;
  statement_number: string | null;
  period_from: string | null;
  period_to: string | null;
  closing_balance: number | null;
}

export interface StatementVerdict {
  /** ≥2 sidrena signala. */
  isStatement: boolean;
  /** Točno 1 signal — sumnja, čovjek bira. */
  needsHumanChoice: boolean;
  /** Imena pogođenih signala (za dijagnostiku i testove). */
  signals: string[];
  extraction: StatementExtraction;
}

/** Prag: dva neovisna sidra su dokaz, jedno je samo sumnja. */
export const STATEMENT_SIGNAL_THRESHOLD = 2;

const IBAN_RE = /\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/g;
const AMOUNT = String.raw`-?\d{1,3}(?:[.\s]\d{3})*,\d{2}`;
const DATE_RE = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\.?/g;

const normalizeSpace = (s: string): string => s.replace(/[\u00a0\t]+/g, ' ');

/** ISO iz hrvatskog oblika; nikad ne izmišlja. */
const isoFrom = (d: string, m: string, y: string): string =>
  `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

const parseHrNumber = (raw: string): number | null => {
  const cleaned = raw.replace(/[.\s]/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const KNOWN_BANKS: readonly string[] = [
  'Zagrebačka banka',
  'Erste',
  'Privredna banka Zagreb',
  'PBZ',
  'OTP banka',
  'Raiffeisenbank',
  'RBA',
  'Hrvatska poštanska banka',
  'HPB',
  'Addiko',
  'Agram banka',
  'KentBank',
  'Partner banka',
  'Istarska kreditna banka',
];

function detectBankName(text: string): string | null {
  const lower = text.toLowerCase();
  for (const bank of KNOWN_BANKS) {
    if (lower.includes(bank.toLowerCase())) return bank;
  }
  return null;
}

function detectStatementNumber(lines: readonly string[]): string | null {
  for (const line of lines) {
    const m = line.match(/izvod[^0-9]{0,20}(\d+[\/-]?\d*)/i);
    if (m) return m[1];
  }
  return null;
}

function detectPeriod(text: string): { from: string | null; to: string | null } {
  const dates: string[] = [];
  for (const m of text.matchAll(DATE_RE)) dates.push(isoFrom(m[1], m[2], m[3]));
  if (dates.length === 0) return { from: null, to: null };
  const sorted = [...new Set(dates)].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

function detectClosingBalance(lines: readonly string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!/novo\s+stanje|zavr[sš]no\s+stanje|stanje\s+na\s+kraju|saldo\s+na\s+kraju/i.test(line)) {
      continue;
    }
    const amounts = line.match(new RegExp(AMOUNT, 'g'));
    if (amounts && amounts.length > 0) return parseHrNumber(amounts[amounts.length - 1]);
  }
  return null;
}

/** IBAN iz zaglavlja (prvih ~25 redaka) — vlasnikov račun, ne banka u podnožju. */
function detectHeaderIban(lines: readonly string[]): string | null {
  const head = lines.slice(0, 25).join('\n').toUpperCase().replace(/\s+/g, ' ');
  const compact = head.replace(/(?<=[A-Z0-9]) (?=[A-Z0-9]{2,4}\b)/g, '');
  const match = compact.match(IBAN_RE);
  return match && match.length > 0 ? match[0] : null;
}

/**
 * Sidreni signali (case-insensitive). Traži se ≥2 različita.
 */
export function statementSignals(rawText: string): string[] {
  const text = normalizeSpace(rawText ?? '');
  if (text.trim().length === 0) return [];
  const lines = text.split(/\r?\n/);
  const hits: string[] = [];

  if (lines.some((l) => /izvod/i.test(l) && /\bbr\.?\b|\bbroj\b/i.test(l))) {
    hits.push('izvod_broj');
  }
  if (/(prethodno|novo)\s+stanje|stanje\s+ra[cč]una/i.test(text)) {
    hits.push('stanje');
  }
  if (/promet.{0,40}duguje/is.test(text) || /potra[zž]uje/i.test(text)) {
    hits.push('promet');
  }
  if (detectHeaderIban(lines)) {
    hits.push('iban_zaglavlje');
  }
  if (/za\s+(dan|razdoblje|period)/i.test(text)) {
    hits.push('razdoblje');
  }
  const tripleRe = new RegExp(`${AMOUNT}\\D{1,20}${AMOUNT}\\D{1,20}${AMOUNT}`);
  if (lines.filter((l) => tripleRe.test(l)).length >= 5) {
    hits.push('retci_sa_saldom');
  }

  return hits;
}

/**
 * Odluka. Pogodak nosi SAMO izvod-polja — nikakva račun-ekstrakcija, nikakva
 * AI dopuna (inače AI „dopuni" iznos računa iz salda).
 */
export function classifyAsStatement(rawText: string | null | undefined): StatementVerdict {
  const text = normalizeSpace(rawText ?? '');
  const signals = statementSignals(text);
  const lines = text.split(/\r?\n/);
  const isStatement = signals.length >= STATEMENT_SIGNAL_THRESHOLD;

  if (!isStatement) {
    return {
      isStatement: false,
      needsHumanChoice: signals.length === 1,
      signals,
      extraction: {
        bank_name: null,
        account_iban: null,
        statement_number: null,
        period_from: null,
        period_to: null,
        closing_balance: null,
      },
    };
  }

  const period = detectPeriod(text);
  return {
    isStatement: true,
    needsHumanChoice: false,
    signals,
    extraction: {
      bank_name: detectBankName(text),
      account_iban: detectHeaderIban(lines),
      statement_number: detectStatementNumber(lines),
      period_from: period.from,
      period_to: period.to,
      closing_balance: detectClosingBalance(lines),
    },
  };
}
