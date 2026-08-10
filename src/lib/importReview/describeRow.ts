/**
 * Import Review — ČISTO PREZENTACIJSKI rastav opisa retka.
 *
 * Bankovni opis često nosi tehnički otpad („462765XXXXXX7262",
 * „d7cb0d49-9eec-4daa-ab63-6dad78ae4e9d", duge reference) koji čovjeku ne
 * znači ništa, a zauzme pola kartice. Ovdje se opis SAMO razdvaja: ljudski
 * dio ide u primarni redak, tehnički u prigušeni sekundarni redak.
 *
 * NIŠTA se ne briše — svaki token završi u jednom od dva izlaza. Nema utjecaja
 * na uvoz, spajanje, pravila ni izvršenje odluka.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Maskirani broj kartice: znamenke + X/* maska, ukupno >= 8 znakova. */
const MASKED_CARD_RE = /^(?=.*[x*])[0-9x*\s-]{8,}$/i;
/** Duga referenca: samo znamenke (>= 8) ili znamenke s crticama/kosim crtama. */
const LONG_REF_RE = /^[0-9][0-9\-/]{7,}$/;
/** IBAN-oblik (npr. HR1234567890123456789). */
const IBAN_RE = /^[A-Z]{2}[0-9]{10,32}$/;

export interface RowDescriptionParts {
  /** Ljudski čitljiv dio opisa (protustrana, mjesto…). Prazno ako ga nema. */
  readonly primary: string;
  /** Tehnički identifikatori, redom kako su se pojavili u opisu. */
  readonly technical: readonly string[];
}

export function isTechnicalToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (UUID_RE.test(t)) return true;
  if (IBAN_RE.test(t)) return true;
  if (MASKED_CARD_RE.test(t)) return true;
  if (LONG_REF_RE.test(t)) return true;
  return false;
}

export function splitRowDescription(description?: string | null): RowDescriptionParts {
  const raw = (description ?? '').trim();
  if (!raw) return { primary: '', technical: [] };

  const tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (tokens.length === 0) return { primary: '', technical: [] };

  const human: string[] = [];
  const technical: string[] = [];
  for (const token of tokens) {
    if (isTechnicalToken(token)) technical.push(token);
    else human.push(token);
  }

  // Ako je SVE tehničko, ne ostavljaj prazan primarni redak — prvi token
  // preuzima ulogu naslova da kartica ne izgleda prazno.
  if (human.length === 0) {
    return { primary: technical[0], technical: technical.slice(1) };
  }

  return { primary: human.join(', '), technical };
}
