/**
 * MAIL UVOZ — deterministički ulov broja dokumenta iz teksta.
 *
 * Kalibracija: AI je s null-opreznim promptom prestao vraćati broj koji u
 * tijelu maila jasno stoji uz etiketu. Rješenje NIJE nagađanje, nego regex
 * ulov SAMO uz etiketu ("broj računa", "račun br.", "invoice no"...).
 * Bez etikete ili s više različitih kandidata = prazno; AI/pregled odlučuju.
 */

export const INVOICE_NUMBER_AMBIGUOUS_WARNING = 'vise_kandidata_broj';

const LABEL =
  '(?:broj\\s+ra[cč]una|ra[cč]un\\s*br\\.?|br\\.\\s*ra[cč]una|broj\\s+dokumenta|broj\\s+ponude|ra[cč]un|invoice\\s*(?:no\\.?|number|#)|document\\s*(?:no\\.?|number))';

// Kandidat: alfanumerički niz s barem jednom znamenkom; dopušteni / - _ .
const CANDIDATE = '([A-Za-z0-9][A-Za-z0-9._\\/-]{2,})';

const RE = new RegExp(`${LABEL}\\s*[:#\\-]?\\s*${CANDIDATE}`, 'gi');

const DATE_LIKE = /^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\.?$/;

const clean = (raw: string): string | null => {
  const trimmed = raw.trim().replace(/[.,;:]+$/, '');
  if (trimmed.length < 3) return null;
  if (!/\d/.test(trimmed)) return null; // "broj računa nije naveden"
  if (DATE_LIKE.test(trimmed)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
};

export interface InvoiceNumberPick {
  invoiceNumber: string | null;
  ambiguous: boolean;
  candidates: string[];
}

/** Broj dokumenta iz slobodnog teksta — samo nedvosmisleno, uz etiketu. */
export function findInvoiceNumber(text: string | null | undefined): InvoiceNumberPick {
  const haystack = text ?? '';
  const found: string[] = [];
  const seen = new Set<string>();
  RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RE.exec(haystack)) !== null) {
    const candidate = clean(match[1] ?? '');
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      found.push(candidate);
    }
  }
  if (found.length === 1) return { invoiceNumber: found[0], ambiguous: false, candidates: found };
  return { invoiceNumber: null, ambiguous: found.length > 1, candidates: found };
}
