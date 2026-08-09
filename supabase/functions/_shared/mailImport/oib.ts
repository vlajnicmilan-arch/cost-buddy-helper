/**
 * OIB — JEDINA implementacija provjere kontrolne znamenke.
 *
 * Algoritam: ISO 7064, MOD 11,10 (hrvatski OIB, 11 znamenki).
 * Gola regex provjera `\d{11}` NIJE dovoljna — svaki broj računa, poštanski
 * broj s nulama ili broj dokumenta prolazi. Zato svaki potrošač (classify,
 * parseUbl, deterministički ulov) MORA ići kroz `isValidOib`.
 *
 * Modul je čist: bez mreže, bez Deno/DOM ovisnosti — re-exporta se u `src`.
 */

/** ISO 7064 MOD 11,10 kontrolna znamenka. */
export function isValidOib(value: string | null | undefined): boolean {
  const digits = (value ?? '').trim();
  if (!/^\d{11}$/.test(digits)) return false;

  let remainder = 10;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder + Number(digits[i])) % 10;
    if (remainder === 0) remainder = 10;
    remainder = (remainder * 2) % 11;
  }
  const control = (11 - remainder) % 10;
  return control === Number(digits[10]);
}

/** `HR12345678901`, `OIB: 12345678901` → `12345678901` (samo ako je valjan). */
export function normalizeOib(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  return isValidOib(digits) ? digits : null;
}

/** Svi VALJANI OIB-i iz slobodnog teksta, bez duplikata, redoslijedom pojave. */
export function findValidOibs(text: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\d{11}/g;
  const haystack = (text ?? '').replace(/[.\s-]/g, (m) => (m === '-' ? '' : m));
  let match: RegExpExecArray | null;
  while ((match = re.exec(haystack)) !== null) {
    const candidate = match[0];
    if (!seen.has(candidate) && isValidOib(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
    // Pomak za 1 — OIB može biti dio dužeg niza znamenki.
    re.lastIndex = match.index + 1;
  }
  return out;
}

export interface SupplierOibPick {
  /** Jedini valjan TUĐI OIB, ili `null` kad je nejednoznačno. */
  oib: string | null;
  /** Više od jednog kandidata — pregled odlučuje, pouzdanost pada. */
  ambiguous: boolean;
  candidates: string[];
}

/**
 * Dokument sadrži i OIB KUPCA (to smo mi). Vlastite OIB-e izbacujemo; tek ako
 * ostane TOČNO JEDAN valjan tuđi OIB, smijemo ga tvrditi kao dobavljača.
 */
export function pickSupplierOib(
  text: string | null | undefined,
  ownOibs: readonly (string | null | undefined)[] = [],
): SupplierOibPick {
  const own = new Set(
    ownOibs.map((o) => (o ?? '').replace(/[^0-9]/g, '')).filter((o) => o.length === 11),
  );
  const candidates = findValidOibs(text).filter((o) => !own.has(o));
  if (candidates.length === 1) return { oib: candidates[0], ambiguous: false, candidates };
  return { oib: null, ambiguous: candidates.length > 1, candidates };
}

export const OIB_AMBIGUOUS_WARNING = 'vise_kandidata_oib';
