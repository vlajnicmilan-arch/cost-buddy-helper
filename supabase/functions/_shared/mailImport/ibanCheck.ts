/**
 * MAIL UVOZ — provjera IBAN-a protiv zapamćene povijesti za isti OIB.
 *
 * TVRDO UPOZORENJE, NEOVISNO O RAZINI POVJERENJA: ako dokument nosi IBAN koji
 * se ne poklapa ni s jednim dosad potvrđenim IBAN-om tog OIB-a, stavka dobiva
 * upozorenje. Ovo je najčešći oblik prijevare (podmetnut broj računa) i mora
 * biti vidljiv i kod T1 poruka.
 */

export const IBAN_MISMATCH_WARNING = 'iban_ne_odgovara_povijesti';
export const IBAN_FIRST_SEEN_NOTICE = 'iban_prvi_put_vidjen';
export const IBAN_AMBIGUOUS_WARNING = 'vise_kandidata_iban';

export const normalizeIban = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** ISO 13616 mod-97 — JEDINA implementacija provjere IBAN-a. */
export function isValidIban(value: string | null | undefined): boolean {
  const iban = normalizeIban(value);
  if (iban.length < 15 || iban.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Svi VALJANI IBAN-i iz slobodnog teksta (bez duplikata, normalizirani). */
export function findValidIbans(text: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // IBAN BILO KOJE ZEMLJE: 2 slova + 2 kontrolne + 10–30 znakova. Mod-97 niže
  // je jedini sudac — ovaj ulov samo skuplja kandidate. Namjerno BEZ `i`:
  // IBAN se tiska velikim slovima, a mala slova su rečenica oko njega.
  const re = /\b[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}/g;


  let match: RegExpExecArray | null;
  while ((match = re.exec(text ?? '')) !== null) {
    // Skraćuj s desna dok ne padne na valjan IBAN (razmaci u ispisu računa).
    let candidate = normalizeIban(match[0]);
    while (candidate.length >= 15) {
      if (isValidIban(candidate)) break;
      candidate = candidate.slice(0, -1);
    }
    if (candidate.length >= 15 && isValidIban(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

/**
 * Hrvatski IBAN je STROGO `HR` + 19 znamenki (21 znak). Bez ove tvrde granice
 * parser zalijepi početak sljedećeg retka („Broj računa") na IBAN.
 */
export const HR_IBAN_RE = /HR\d{19}/;

/** Prvi hrvatski IBAN iz teksta — nikad duži od 21 znaka. */
export function findHrIban(text: string | null | undefined): string | null {
  const compact = normalizeIban(text);
  const match = compact.match(new RegExp(HR_IBAN_RE.source, 'g'));
  if (!match) return null;
  const hit = match.find((c) => isValidIban(c));
  return hit ?? null;
}

/**
 * Očisti IBAN: vraća normaliziran oblik SAMO ako je mod-97 valjan (a za HR i
 * točno 21 znak). Sve ostalo je smeće i vraća se prazan niz.
 */
export function sanitizeIban(value: string | null | undefined): string {
  const normalized = normalizeIban(value);
  if (normalized.startsWith('HR')) {
    const hr = findHrIban(normalized);
    return hr ?? '';
  }
  return isValidIban(normalized) ? normalized : '';
}


export interface IbanCheckResult {
  /** Novi IBAN uz postojeću povijest za taj OIB. */
  mismatch: boolean;
  /** Za taj OIB nemamo nijedan zapamćen IBAN. */
  firstSeen: boolean;
  warnings: string[];
  normalized: string;
}

export function checkIbanAgainstHistory(
  iban: string | null | undefined,
  knownIbans: readonly (string | null | undefined)[],
): IbanCheckResult {
  const normalized = normalizeIban(iban);
  const known = new Set(
    knownIbans.map(normalizeIban).filter((v) => v.length > 0),
  );

  if (normalized.length === 0) {
    return { mismatch: false, firstSeen: false, warnings: [], normalized: '' };
  }
  if (known.size === 0) {
    return {
      mismatch: false,
      firstSeen: true,
      warnings: [IBAN_FIRST_SEEN_NOTICE],
      normalized,
    };
  }
  if (known.has(normalized)) {
    return { mismatch: false, firstSeen: false, warnings: [], normalized };
  }
  return {
    mismatch: true,
    firstSeen: false,
    warnings: [IBAN_MISMATCH_WARNING],
    normalized,
  };
}
