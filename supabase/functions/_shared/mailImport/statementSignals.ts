// MAIL UVOZ — VETO KORAK 2b: „ovo je BANKOVNI IZVOD, ne račun".
//
// Izvod banke koja je već poznat pošiljatelj/OIB inače propada kroz korak 3
// (heuristika) i tvrdo postaje `racun` — pa se saldo računa knjiži kao iznos
// računa. Zato ovaj korak ide PRIJE svega osim XML/UBL-a i verifikacije.
//
// Načelo: ≥2 sidrena signala = `izvod`. 0–1 signal = `nepoznato` s
// `needsHumanChoice` — NIKAD tiho `racun`.

import { findHrIban, findValidIbans } from './ibanCheck.ts';

export interface StatementExtraction {
  bank_name: string | null;
  account_iban: string | null;
  /** Identitet e-novčanika/računa kad IBAN ne postoji (npr. KEKS Pay). */
  account_number: string | null;
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
  /** Mjesečni izvod charge/kreditne kartice (tablica troškova, ne bankovni promet). */
  isCardStatement: boolean;
  /** Imena pogođenih signala (za dijagnostiku i testove). */
  signals: string[];
  extraction: StatementExtraction;
}

/** Prag: dva neovisna sidra su dokaz, jedno je samo sumnja. */
export const STATEMENT_SIGNAL_THRESHOLD = 2;

/**
 * SLABI signal: sam za sebe ne znači ništa. IBAN u zaglavlju ima i svaki
 * običan račun („IBAN za uplatu") — bez ovog razlikovanja bi svaki račun
 * završio kao „možda izvod".
 */
export const WEAK_STATEMENT_SIGNALS: readonly string[] = [
  'iban_zaglavlje',
  'broj_racuna',
  'razdoblje_zaglavlje',
];

const strongCount = (signals: readonly string[]): number =>
  signals.filter((s) => !WEAK_STATEMENT_SIGNALS.includes(s)).length;

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

/**
 * ZONA IZDAVATELJA — jedina zona iz koje smije doći IDENTITET dokumenta
 * (ime banke, IBAN, broj računa, razdoblje, završni saldo).
 *
 * Definicija (namjerno konzervativna): zona počinje na prvom retku i završava
 * PRIJE prvog retka prometa. Redak prometa je ili zaglavlje tablice
 * („Datum … Opis …"), ili redak koji nosi datum i iznos. Ako tablice nema,
 * zona je prvih `ISSUER_ZONE_FALLBACK` redaka.
 *
 * Nema donje granice: kad tablica počne odmah, zona je kratka i polja ostaju
 * prazna. Kriva banka pokupljena iz retka prometa („Primatelj: Pbz7bauhaus")
 * je otrov; prazna crtica je poštena.
 *
 * Iznimka su OZNAČENI blokovi identiteta („IBAN" / „BIC" u zasebnom retku, s
 * vrijednošću u sljedećim recima) — Revolut ih tiska ispod tablice. Iz njih se
 * čita SAMO IBAN, nikad ime banke.
 */
export const ISSUER_ZONE_FALLBACK = 25;
const ISSUER_ZONE_MAX = 60;
const IDENTITY_BLOCK_SPAN = 4;

const TABLE_HEADER_RE = /\bdatum\b.{0,40}\bopis\b|\bopis\b.{0,40}\bdatum\b/i;
const AMOUNT_RE = new RegExp(AMOUNT);
const ANY_DATE_RE =
  /\b\d{1,2}\.\s?\d{1,2}\.\s?\d{4}|\b\d{1,2}\.\s?[a-zčćžšđ]{3,12}\.?\s+\d{4}/i;

const isTransactionRow = (line: string): boolean =>
  TABLE_HEADER_RE.test(line) || (ANY_DATE_RE.test(line) && AMOUNT_RE.test(line));

/** Indeks prvog retka prometa; `ISSUER_ZONE_FALLBACK` kad ga nema. */
export function issuerZoneEnd(lines: readonly string[]): number {
  const cut = lines.findIndex(isTransactionRow);
  if (cut < 0) return Math.min(lines.length, ISSUER_ZONE_FALLBACK);
  return Math.min(cut, ISSUER_ZONE_MAX);
}

/** Redci zaglavlja — bez ijednog retka prometa. */
export function issuerZone(lines: readonly string[]): string[] {
  return lines.slice(0, issuerZoneEnd(lines));
}

/** Označeni blokovi identiteta bilo gdje u dokumentu (samo za IBAN). */
function identityBlockLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!/^\s*(iban|bic|swift)\b\s*:?\s*$/i.test(line) && !/^\s*iban\s*:/i.test(line)) return;
    for (let j = i; j < Math.min(lines.length, i + IDENTITY_BLOCK_SPAN + 1); j += 1) {
      if (isTransactionRow(lines[j])) break;
      out.push(lines[j]);
    }
  });
  return out;
}

interface BankPattern {
  /** Kanonsko ime koje ide u ekstrakciju. */
  name: string;
  re: RegExp;
}

/**
 * Imenik banaka i e-novčanika. Redoslijed je bitan: specifičnije (višerječno)
 * ime mora doći prije kratice iste kuće.
 */
const KNOWN_BANKS: readonly BankPattern[] = [
  { name: 'Zagrebačka banka', re: /zagreba[cč]ka\s+banka|\bzaba\b/i },
  { name: 'Privredna banka Zagreb', re: /privredna\s+banka\s+zagreb/i },
  { name: 'PBZ', re: /\bpbz\b/i },
  { name: 'Erste', re: /\berste\b/i },
  { name: 'OTP banka', re: /\botp\b/i },
  { name: 'Raiffeisenbank', re: /raiffeisen/i },
  { name: 'RBA', re: /\brba\b/i },
  { name: 'Hrvatska poštanska banka', re: /hrvatska\s+po[sš]tanska\s+banka/i },
  { name: 'HPB', re: /\bhpb\b/i },
  { name: 'Addiko', re: /\baddiko\b/i },
  { name: 'Agram banka', re: /agram\s+banka/i },
  { name: 'KentBank', re: /\bkentbank\b/i },
  { name: 'Partner banka', re: /partner\s+banka/i },
  { name: 'Istarska kreditna banka', re: /istarska\s+kreditna\s+banka/i },
  // Neobanke i e-novčanici koje već srećemo u pošti.
  { name: 'Revolut', re: /\brevolut\b/i },
  { name: 'KEKS Pay', re: /\bkeks\s*pay\b/i },
  { name: 'Aircash', re: /\baircash\b/i },
  { name: 'Wise', re: /\btransferwise\b|\bwise\s+(europe|payments)\b/i },
  { name: 'N26', re: /\bn26\b/i },
];

/** Kanonska imena izdavatelja za klijentske stop-vrijednosti trgovca. */
export const KNOWN_BANK_NAMES: readonly string[] = KNOWN_BANKS.map((bank) => bank.name);

/**
 * Ime banke ISKLJUČIVO iz zone izdavatelja. Naslov e-maila je POMOĆNI signal:
 * koristi se samo za razrješenje kad zona nudi više kandidata — nikad kao
 * samostalan izvor.
 */
export function detectBankName(
  zoneText: string,
  subjectHint?: string | null,
): string | null {
  const hits = KNOWN_BANKS.filter((b) => b.re.test(zoneText));
  if (hits.length === 0) return null;
  if (hits.length > 1 && (subjectHint ?? '').trim().length > 0) {
    const confirmed = hits.find((b) => b.re.test(subjectHint as string));
    if (confirmed) return confirmed.name;
  }
  return hits[0].name;
}

function detectStatementNumber(lines: readonly string[]): string | null {
  for (const line of lines) {
    const m = line.match(/izvod[^0-9]{0,20}(\d+[\/-]?\d*)/i);
    if (m) return m[1];
  }
  return null;
}

/** Hrvatski nazivi mjeseci (puni genitiv i kratice s Revolut izvatka). */
const HR_MONTHS: readonly (readonly string[])[] = [
  ['sij', 'siječnja', 'sijecnja'],
  ['velj', 'veljače', 'veljace'],
  ['ožu', 'ozu', 'ožujka', 'ozujka'],
  ['tra', 'travnja'],
  ['svi', 'svibnja'],
  ['lip', 'lipnja'],
  ['srp', 'srpnja'],
  ['kol', 'kolovoza'],
  ['ruj', 'rujna'],
  ['lis', 'listopada'],
  ['stu', 'studenog', 'studenoga'],
  ['pro', 'prosinca'],
];

const monthFromName = (raw: string): number | null => {
  const w = raw.toLowerCase().replace(/\.$/, '');
  const idx = HR_MONTHS.findIndex((names) => names.includes(w));
  return idx < 0 ? null : idx + 1;
};

const isoFromNumeric = (raw: string): string | null => {
  const m = raw.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/);
  return m ? isoFrom(m[1], m[2], m[3]) : null;
};

/** „2. srpnja 2025." / „10. kol 2026." → ISO. Nikad ne izmišlja. */
export function parseCroatianWordDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\.\s*([A-Za-zčćžšđČĆŽŠĐ]{3,12})\.?\s+(\d{4})/);
  if (!m) return null;
  const month = monthFromName(m[2]);
  if (month === null) return null;
  return isoFrom(m[1], String(month), m[3]);
}

const oneDate = (raw: string): string | null =>
  parseCroatianWordDate(raw) ?? isoFromNumeric(raw);

/**
 * Izričito napisano razdoblje: „… od 2. srpnja 2025. do 10. kolovoza 2026."
 * ili „Razdoblje 01.06.2026. - 30.06.2026.". Jače je od raspona svih datuma.
 */
export function detectPeriodRange(text: string): { from: string; to: string } | null {
  const RANGE = /\bod\s+([^\n]{6,30}?\d{4})\.?\s+do\s+([^\n]{6,30}?\d{4})\.?/gi;
  for (const m of text.matchAll(RANGE)) {
    const from = oneDate(m[1]);
    const to = oneDate(m[2]);
    if (from && to) return { from, to };
  }
  const DASH = /(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})\.?\s*[-–]\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})/;
  const d = text.match(DASH);
  if (d) {
    const from = isoFromNumeric(d[1]);
    const to = isoFromNumeric(d[2]);
    if (from && to) return { from, to };
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
  // „Konačno stanje", „Novo stanje", „Završno stanje", „Stanje na dan/kraju".
  const CLOSING_RE =
    /kona[cč]no\s+stanje|novo\s+stanje|zavr[sš]no\s+stanje|stanje\s+na\s+(dan|kraju)|saldo\s+na\s+kraju/i;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!CLOSING_RE.test(line)) continue;
    const amounts = line.match(new RegExp(AMOUNT, 'g'));
    if (amounts && amounts.length > 0) return parseHrNumber(amounts[amounts.length - 1]);
  }
  return null;
}

/**
 * Revolut „Sažetak salda": zaglavlje sa stupcem „Završni saldo", pa redak
 * „Ukupno …" u kojem je zadnji iznos završni saldo.
 */
function detectSummaryClosingBalance(zone: readonly string[]): number | null {
  const headerIdx = zone.findIndex((l) => /zavr[sš]ni\s+saldo/i.test(l));
  if (headerIdx < 0) return null;
  for (let i = headerIdx + 1; i < Math.min(zone.length, headerIdx + 8); i += 1) {
    if (!/^\s*ukupno\b/i.test(zone[i])) continue;
    const amounts = zone[i].match(new RegExp(AMOUNT, 'g'));
    if (amounts && amounts.length > 0) return parseHrNumber(amounts[amounts.length - 1]);
  }
  return null;
}

/**
 * IDENTITET BEZ IBAN-A: e-novčanici (KEKS Pay) nose samo „Broj računa".
 * Traži se SAMO u zoni izdavatelja.
 */
function detectAccountNumber(zone: readonly string[]): string | null {
  for (const line of zone) {
    const m = line.match(/broj\s+ra[cč]una\s*:?\s*([0-9][0-9\s-]{3,})/i);
    if (m) {
      const digits = m[1].replace(/[^0-9]/g, '');
      if (digits.length >= 4) return digits;
    }
  }
  return null;
}

/**
 * IBAN BILO KOJE ZEMLJE, ali samo iz zone izdavatelja (+ označenih blokova
 * identiteta). Hrvatski IBAN je poseban slučaj istog puta (tvrdih HR+19).
 * Protustrane iz retka prometa nikad ne ulaze ovamo.
 */
function detectHeaderIban(lines: readonly string[]): string | null {
  const head = [...issuerZone(lines), ...identityBlockLines(lines)].join('\n');
  const hr = findHrIban(head);
  if (hr) return hr;
  const foreign = findValidIbans(head);
  return foreign.length > 0 ? foreign[0] : null;
}


/**
 * MJESEČNI IZVOD CHARGE/KREDITNE KARTICE.
 *
 * Banka ga NASLOVLJAVA „obavijest", pa nema ni „izvod", ni „stanje", ni
 * duguje/potražuje — klasični sidreni signali ga ne vide i propadao je u tihi
 * `nije_za_nas`.
 *
 * TVRDA OGRADA PROTIV PROMIDŽBE: signali zaglavlja („Odobreni limit",
 * „Datum terećenja", „Broj računa namirenja", naslov obavijesti) broje se
 * ISKLJUČIVO ako dokument nosi TABLICU TRANSAKCIJA. Promidžbena ili
 * informativna kartična poruka nema retke prometa i ostaje van lijevka.
 */
const CARD_TXN_ROW_RE = new RegExp(
  // „…,SPLIT.HRV/12.02/EUR/44,57…" — mjesto/datum/valuta/iznos u retku troška.
  String.raw`\/\d{1,2}\.\d{1,2}\/[A-Z]{3}\/${AMOUNT}`,
);
const CARD_TXN_ROWS_THRESHOLD = 3;

const CARD_HEADER_PATTERNS: readonly { name: string; re: RegExp }[] = [
  {
    name: 'kartica_obavijest_naslov',
    re: /obavijest\s+o\s+u[cč]injenim\s+tro[sš]kovima[^\n]{0,40}kartic/i,
  },
  { name: 'datum_terecenja', re: /datum\s+tere[cć]enja/i },
  { name: 'odobreni_limit', re: /odobreni\s+limit/i },
  { name: 'racun_namirenja', re: /broj\s+ra[cč]una\s+namirenja/i },
  { name: 'broj_kartice', re: /za\s+karticu\s+broj/i },
];

/** Signali kartičnog izvoda; prazno kad nema tablice troškova. */
export function cardStatementSignals(lines: readonly string[]): string[] {
  const rows = lines.filter((l) => CARD_TXN_ROW_RE.test(l)).length;
  if (rows < CARD_TXN_ROWS_THRESHOLD) return [];
  const text = lines.join('\n');
  const hits = CARD_HEADER_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
  // Sama tablica bez ijednog zaglavlja nije dokaz kartičnog izvoda.
  return hits.length === 0 ? [] : ['karticni_retci', ...hits];
}

export const CARD_STATEMENT_SIGNAL = 'karticni_retci';

/**
 * MINI-EKSTRAKTOR CHARGE-KARTIČNOG IZVODA (nula AI).
 *
 * Charge izvod govori drugim dijalektom od bankovnog: nema „Izvod br.", nema
 * salda, a datumi u zaglavlju („Datum obavijesti", „Datum terećenja") su
 * MJESEC POSLIJE razdoblja troškova — pa je opći raspon svih datuma davao
 * krivo razdoblje. Ovdje se svako polje čita iz svog izvora ili ostaje prazno.
 */

/** Podnožje s otiskom izdavatelja (MB/OIB/web) — nikad redak prometa. */
const CARD_IMPRINT_RE = /\bMB\s*:|\bOIB\s*:|•/;

/**
 * Zaglavlje s vrijednostima u zasebnom bloku:
 *   „Obavijest broj:" „Datum obavijesti:" … pa niz vrijednosti istim redom.
 * Vraća vrijednost za traženu etiketu; podržava i inline oblik „Etiketa: x".
 */
function cardLabelValue(lines: readonly string[], labelRe: RegExp): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    const inline = lines[i].match(new RegExp(`${labelRe.source}\\s*:\\s*(\\S.*)$`, 'i'));
    if (inline && inline[1].trim() !== '') return inline[1].trim();
  }
  let i = 0;
  while (i < lines.length) {
    if (!/:\s*$/.test(lines[i])) {
      i += 1;
      continue;
    }
    const labels: string[] = [];
    while (i < lines.length && /:\s*$/.test(lines[i])) {
      labels.push(lines[i]);
      i += 1;
    }
    const values: string[] = [];
    while (i < lines.length && values.length < labels.length && lines[i].trim() !== '') {
      if (/:\s*$/.test(lines[i])) break;
      values.push(lines[i].trim());
      i += 1;
    }
    const ci = new RegExp(labelRe.source, 'i');
    const idx = labels.findIndex((l) => ci.test(l));
    if (idx >= 0 && idx < values.length) return values[idx];
  }
  return null;
}

/** Datumi knjiženja iz redaka troška — jedini pošten izvor razdoblja. */
function cardRowDates(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!CARD_TXN_ROW_RE.test(line)) continue;
    for (const m of line.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)) {
      out.push(isoFrom(m[1], m[2], m[3]));
    }
  }
  return out;
}

/** „1.093,53Ukupno po računu: 514710744040 EUR:" → 1093.53; inače prazno. */
function cardTotalCharge(lines: readonly string[]): number | null {
  const found = new Set<number>();
  for (const line of lines) {
    if (!/ukupno\s+po\s+ra[cč]unu/i.test(line)) continue;
    const amounts = line.match(new RegExp(AMOUNT, 'g'));
    if (!amounts || amounts.length === 0) continue;
    const value = parseHrNumber(amounts[0]);
    if (value !== null) found.add(value);
  }
  // Više različitih zbrojeva = nejednoznačno → prazno (nikad kriva vrijednost).
  return found.size === 1 ? [...found][0] : null;
}

export function cardStatementExtraction(
  lines: readonly string[],
  subject?: string | null,
): StatementExtraction {
  const zone = issuerZone(lines);
  const imprint = lines.filter((l) => CARD_IMPRINT_RE.test(l) && !CARD_TXN_ROW_RE.test(l));
  const bankName = detectBankName([...zone, ...imprint].join('\n'), subject);

  // Identitet kartice je BROJ RAČUNA KORIŠTENJA; IBAN namirenja je tekući
  // račun s kojeg se dug pokriva i nikad ne smije postati identitet kartice.
  const usage =
    cardLabelValue(lines, /broj\s+ra[cč]una\s+kori[sš]tenja/) ??
    (lines.find((l) => /ukupno\s+po\s+ra[cč]unu/i.test(l))?.match(/ra[cč]unu\s*:?\s*(\d{6,})/i)?.[1] ??
      null);
  const accountNumber = usage ? usage.replace(/[^0-9]/g, '') || null : null;

  const notice = cardLabelValue(lines, /obavijest\s+broj/);
  const statementNumber = notice ? (notice.match(/[0-9][0-9\/-]*/)?.[0] ?? null) : null;

  const explicit = detectPeriodRange(zone.join('\n'));
  const rowDates = [...new Set(cardRowDates(lines))].sort();
  const period = explicit
    ? { from: explicit.from, to: explicit.to }
    : rowDates.length > 0
      ? { from: rowDates[0], to: rowDates[rowDates.length - 1] }
      : { from: null, to: null };

  return {
    bank_name: bankName,
    account_iban: null,
    account_number: accountNumber,
    statement_number: statementNumber,
    period_from: period.from,
    period_to: period.to,
    closing_balance: cardTotalCharge(lines),
  };
}


/**
 * Sidreni signali (case-insensitive). Traži se ≥2 različita.
 */
export function statementSignals(rawText: string): string[] {
  const text = normalizeSpace(rawText ?? '');
  if (text.trim().length === 0) return [];
  const lines = text.split(/\r?\n/);
  const hits: string[] = [...cardStatementSignals(lines)];


  // Naslov „IZVOD PROMETA (PO RAČUNU)" je sam po sebi dokaz — nosi ga KEKS Pay
  // i druge e-novčanik izvatke bez IBAN-a i bez duguje/potražuje stupaca.
  if (/izvod\s+prometa/i.test(text)) {
    hits.push('izvod_prometa');
  }
  // Revolut HR koristi „Izvadak za EUR". Pretražuje se CIJELI tekst jer se
  // naslov ponavlja po stranicama, a pravni boilerplate može doći prije tablice.
  if (/\bizvadak(?:\s+za\s+[A-Z]{3})?\b/i.test(text)) {
    hits.push('izvadak_naslov');
  }
  if (lines.some((l) => /izvod/i.test(l) && /\bbr\.?\b|\bbroj\b/i.test(l))) {
    hits.push('izvod_broj');
  }
  if (/(prethodno|novo|po[cč]etno|zavr[sš]no|kona[cč]no)\s+stanje|stanje\s+ra[cč]una/i.test(text)) {
    hits.push('stanje');
  }
  if (/promet.{0,40}duguje/is.test(text) || /potra[zž]uje/i.test(text)) {
    hits.push('promet');
  }
  if (
    /datum\s+(?:po[cč]etka|dovr[sš]etka).{0,100}(?:poslani|primljeni|iza[sš]ao|u[sš]ao)\s+novac/is.test(text)
    || /date\s+(?:started|completed).{0,100}money\s+(?:out|in)|money\s+out.{0,60}money\s+in/is.test(text)
    || /datum\s+opis\s+poslani\s+novac\s+primljeni\s+novac\s+saldo/i.test(text)
  ) {
    hits.push('revolut_retci');
  }
  if (detectHeaderIban(lines)) {
    hits.push('iban_zaglavlje');
  }
  if (/za\s+(dan|razdoblje|period)/i.test(text)) {
    hits.push('razdoblje');
  }
  if (detectAccountNumber(lines)) {
    hits.push('broj_racuna');
  }
  if (lines.slice(0, 25).some((l) => /^\s*razdoblje\b/i.test(l))) {
    hits.push('razdoblje_zaglavlje');
  }
  // Tablica prometa: ili tri iznosa u retku (klasična banka), ili
  // datum + iznos + tekuće stanje (KEKS oblik, bez duguje/potražuje).
  const tripleRe = new RegExp(`${AMOUNT}\\D{1,20}${AMOUNT}\\D{1,20}${AMOUNT}`);
  const dateAmountRe = new RegExp(
    String.raw`\d{1,2}\.\s?\d{1,2}\.\s?\d{4}\.?.{0,80}?${AMOUNT}\D{1,30}${AMOUNT}`,
  );
  const tableRows = lines.filter((l) => tripleRe.test(l) || dateAmountRe.test(l)).length;
  if (tableRows >= 5) {
    hits.push('retci_sa_saldom');
  }

  return hits;
}

/**
 * Odluka. Pogodak nosi SAMO izvod-polja — nikakva račun-ekstrakcija, nikakva
 * AI dopuna (inače AI „dopuni" iznos računa iz salda).
 *
 * `subject` (naslov e-maila) je POMOĆNI signal za ime banke: razrješava
 * višeznačnost u zoni izdavatelja, ali sam ne može stvoriti ime.
 */
export function classifyAsStatement(
  rawText: string | null | undefined,
  subject?: string | null,
): StatementVerdict {
  const text = normalizeSpace(rawText ?? '');
  const signals = statementSignals(text);
  const lines = text.split(/\r?\n/);
  const strong = strongCount(signals);
  // Dokaz = dva sidra od kojih barem jedno nije slabo.
  const isStatement = signals.length >= STATEMENT_SIGNAL_THRESHOLD && strong >= 1;

  const isCardStatement = signals.includes(CARD_STATEMENT_SIGNAL);

  if (!isStatement) {
    return {
      isStatement: false,
      // Sumnja postoji samo uz TOČNO jedan jak signal; sam IBAN nije sumnja.
      needsHumanChoice: strong === 1,
      isCardStatement: false,
      signals,
      extraction: {
        bank_name: null,
        account_iban: null,
        account_number: null,
        statement_number: null,
        period_from: null,
        period_to: null,
        closing_balance: null,
      },
    };
  }

  if (isCardStatement) {
    // Charge dijalekt ima vlastiti mini-ekstraktor (drugi izvori za svako polje).
    return {
      isStatement: true,
      needsHumanChoice: false,
      isCardStatement: true,
      signals,
      extraction: cardStatementExtraction(lines, subject),
    };
  }

  const zone = issuerZone(lines);
  const zoneText = zone.join('\n');

  // Razdoblje: izričito napisan raspon (zona → cijeli tekst) pobjeđuje raspon
  // svih datuma, koji je zadnja linija obrane.
  const period =
    detectPeriodRange(zoneText) ?? detectPeriodRange(text) ?? detectPeriod(text);
  return {
    isStatement: true,
    needsHumanChoice: false,
    isCardStatement,
    signals,
    extraction: {
      bank_name: detectBankName(zoneText, subject),
      account_iban: detectHeaderIban(lines),
      account_number: detectAccountNumber(zone),
      statement_number: detectStatementNumber(zone),
      period_from: period.from,
      period_to: period.to,
      closing_balance: detectSummaryClosingBalance(zone) ?? detectClosingBalance(lines),
    },
  };
}


/**
 * PRAVILO TIŠINE — „nesigurno nikad ne nestaje".
 *
 * Dokument koji nosi financijsku supstancu (broj računa u IBAN obliku + više
 * iznosa / tablicu) ne smije tiho pasti u `nije_za_nas` kad je pouzdanost
 * NISKA. Namjerno LABAV IBAN uzorak: ovdje se ne presuđuje o točnosti broja,
 * nego samo o tome zaslužuje li dokument ljudsko oko.
 */
const LOOSE_IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/;
const MIN_AMOUNTS_FOR_SUBSTANCE = 3;

export function carriesFinancialSubstance(rawText: string | null | undefined): boolean {
  const text = normalizeSpace(rawText ?? '');
  if (text.trim().length === 0) return false;
  const hasIban = LOOSE_IBAN_RE.test(text) || findValidIbans(text).length > 0;
  if (!hasIban) return false;
  const amounts = text.match(new RegExp(AMOUNT, 'g')) ?? [];
  return amounts.length >= MIN_AMOUNTS_FOR_SUBSTANCE;
}


/**
 * SALDO S PAPIRA ZA SVAKI UVOZNI PUT.
 *
 * Isti mehanizam koji već presuđuje na mail-putu (`detectSummaryClosingBalance`
 * → Revolutov „Sažetak salda", pa `detectClosingBalance` → „Konačno/Novo
 * stanje"), samo dostupan i disk-putu (parse-pdf-statement, tekstualni sloj).
 * NEMA novog parsera: istina o saldu pripada IZVODU, ne putu kojim je ušao.
 *
 * Čita se nad CIJELIM tekstom (zaglavlje), nikad po segmentacijskim blokovima.
 * Bez prepoznatog salda vraća `null` — nagađanja nema.
 */
export interface StatementBalanceReading {
  closingBalance: number | null;
  /** Valuta ako stoji uz sam iznos; inače null. */
  currency: string | null;
  /** Kraj razdoblja — datum na koji saldo vrijedi. */
  periodTo: string | null;
  /** Početak razdoblja — donja granica brane na datum stavke. */
  periodFrom: string | null;
}


const CURRENCY_SYMBOLS: readonly (readonly [RegExp, string])[] = [
  [/€|\bEUR\b/i, 'EUR'],
  [/\$|\bUSD\b/i, 'USD'],
  [/£|\bGBP\b/i, 'GBP'],
];

/** Valuta iz retka u kojem je pročitan saldo. */
function currencyFromLine(line: string): string | null {
  for (const [re, code] of CURRENCY_SYMBOLS) {
    if (re.test(line)) return code;
  }
  return null;
}

/** Redak iz kojeg je saldo pročitan — služi samo za valutu i dijagnostiku. */
function closingBalanceLine(lines: readonly string[], value: number): string | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const amounts = lines[i].match(new RegExp(AMOUNT, 'g'));
    if (!amounts) continue;
    for (const raw of amounts) {
      const parsed = parseHrNumber(raw);
      if (parsed !== null && Math.abs(parsed - value) < 0.005) return lines[i];
    }
  }
  return null;
}

export function extractStatementBalance(
  rawText: string | null | undefined,
): StatementBalanceReading {
  const text = normalizeSpace(rawText ?? '');
  if (text.trim().length === 0) {
    return { closingBalance: null, currency: null, periodTo: null, periodFrom: null };
  }
  const lines = text.split(/\r?\n/);
  const zone = issuerZone(lines);
  const closing = detectSummaryClosingBalance(zone) ?? detectClosingBalance(lines);
  const period = detectPeriodRange(zone.join('\n')) ?? detectPeriodRange(text);
  if (closing === null) {
    return {
      closingBalance: null,
      currency: null,
      periodTo: period?.to ?? null,
      periodFrom: period?.from ?? null,
    };
  }
  const line = closingBalanceLine(zone.length > 0 ? zone : lines, closing)
    ?? closingBalanceLine(lines, closing);
  return {
    closingBalance: closing,
    currency: line ? currencyFromLine(line) : null,
    periodTo: period?.to ?? null,
    periodFrom: period?.from ?? null,
  };
}

