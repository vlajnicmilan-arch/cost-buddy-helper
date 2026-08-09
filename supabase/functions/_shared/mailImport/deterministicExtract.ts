/**
 * MAIL UVOZ — deterministički ulov iz teksta, PRIJE ijednog AI poziva.
 *
 * Nula troška: OIB (ISO 7064) + IBAN (mod-97) + datum dospijeća heuristikom.
 * Pravilo: tvrdimo SAMO nedvosmisleno. Više kandidata = prazno polje + niska
 * pouzdanost; pregled odlučuje. Nikad ne pogađamo.
 */

import { pickSupplierOib, OIB_AMBIGUOUS_WARNING } from './oib.ts';
import { findValidIbans, IBAN_AMBIGUOUS_WARNING } from './ibanCheck.ts';

export const DUE_DATE_AMBIGUOUS_WARNING = 'vise_kandidata_dospijece';

const DUE_KEYWORDS =
  /(dospije[cć]e|dospijeva|rok\s+pla[cć]anja|valuta\s+pla[cć]anja|datum\s+dospije[cć]a|due\s+date|payment\s+due)/i;

const DATE_RE = /(\d{1,2})[.\/-]\s?(\d{1,2})[.\/-]\s?(\d{4})|(\d{4})-(\d{2})-(\d{2})/;

const toIso = (m: RegExpMatchArray): string | null => {
  if (m[4]) return `${m[4]}-${m[5]}-${m[6]}`;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Datum dospijeća iz teksta — SAMO iz retka koji nosi ključnu riječ.
 * Nema ključne riječi ili ima više različitih datuma = prazno.
 */
export function findDueDate(text: string | null | undefined): {
  dueDate: string | null;
  ambiguous: boolean;
} {
  const lines = (text ?? '').split(/\r?\n/);
  const found = new Set<string>();
  for (const line of lines) {
    if (!DUE_KEYWORDS.test(line)) continue;
    const match = line.match(DATE_RE);
    if (!match) continue;
    const iso = toIso(match);
    if (iso) found.add(iso);
  }
  if (found.size === 1) return { dueDate: [...found][0], ambiguous: false };
  return { dueDate: null, ambiguous: found.size > 1 };
}

export interface DeterministicInput {
  /** Tijelo e-maila + tekstualni sloj PDF-a, spojeni. */
  text: string;
  /** OIB-i vlasnika aliasa — dokument nosi i OIB KUPCA, to smo mi. */
  ownOibs?: readonly (string | null | undefined)[];
}

export interface DeterministicResult {
  supplier_oib: string | null;
  iban: string | null;
  due_date: string | null;
  warnings: string[];
  /** Bar jedno polje je bilo višeznačno — pouzdanost se obara. */
  ambiguous: boolean;
}

/** Uklanja pojavu IBAN-a iz teksta, tolerirajuci razmake u ispisu. */
const stripIban = (text: string, iban: string): string => {
  const spaced = iban.split('').join('[\\s-]*');
  return text.replace(new RegExp(spaced, 'gi'), ' ');
};

export function deterministicExtract(input: DeterministicInput): DeterministicResult {
  const warnings: string[] = [];

  const ibans = findValidIbans(input.text);

  // IBAN nosi niz znamenki iz kojeg bi lako ispao lazni "valjani OIB" —
  // zato se IBAN-i uklone iz teksta prije trazenja OIB-a.
  let oibHaystack = input.text ?? '';
  for (const found of ibans) oibHaystack = stripIban(oibHaystack, found);

  const oibPick = pickSupplierOib(oibHaystack, input.ownOibs ?? []);
  if (oibPick.ambiguous) warnings.push(OIB_AMBIGUOUS_WARNING);

  let iban: string | null = null;
  if (ibans.length === 1) iban = ibans[0];
  else if (ibans.length > 1) warnings.push(IBAN_AMBIGUOUS_WARNING);

  const due = findDueDate(input.text);
  if (due.ambiguous) warnings.push(DUE_DATE_AMBIGUOUS_WARNING);

  return {
    supplier_oib: oibPick.oib,
    iban,
    due_date: due.dueDate,
    warnings,
    ambiguous: oibPick.ambiguous || ibans.length > 1 || due.ambiguous,
  };
}
