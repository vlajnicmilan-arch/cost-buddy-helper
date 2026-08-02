/**
 * eRačun — popravak dvostruko kodiranog teksta (mojibake).
 *
 * Neki sustavi koji izdaju račune zapišu UTF-8 sadržaj tako da ga prethodno
 * pročitaju kao cp1252 pa ponovno kodiraju u UTF-8. Rezultat: `graÄ'evinski`
 * umjesto `građevinski`, `GaliÄ‡` umjesto `Galić`.
 *
 * Ovdje se postupak pokušava obrnuti: tekst → cp1252 bajtovi → dekodiranje kao
 * UTF-8. Popravak se prihvaća SAMO ako dekodiranje uspije i rezultat sadrži
 * hrvatske dijakritike. U svakom drugom slučaju vraća se izvorni tekst.
 *
 * TVRDO PRAVILO: primjenjuje se isključivo na nazive i opise. Nikad na
 * `payment_reference`, broj računa, OIB, IBAN ni iznose.
 */

/** Znakovi koje cp1252 mapira u raspon 0x80–0x9F (razlika u odnosu na latin-1). */
const CP1252_HIGH: Record<string, number> = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84,
  '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88,
  '\u2030': 0x89, '\u0160': 0x8a, '\u2039': 0x8b, '\u0152': 0x8c,
  '\u017D': 0x8e, '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93,
  '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9a, '\u203A': 0x9b,
  '\u0153': 0x9c, '\u017E': 0x9e, '\u0178': 0x9f,
};

/** Tragovi dvostrukog kodiranja — bez njih se ni ne pokušava popravljati. */
const SUSPECT = /[\u00C2-\u00C5][\u0080-\u00FF\u2013\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u0152\u0153\u0160\u0161\u017D\u017E\u0178\u0192\u02C6\u02DC\u20AC\u2122]/;
/** Hrvatski dijakritici — dokaz da je popravak dao smisleni rezultat. */
const CROATIAN = /[čćžšđČĆŽŠĐ]/;

/** Tekst → cp1252 bajtovi. `null` kad neki znak nije predstavljiv. */
const toCp1252Bytes = (value: string): Uint8Array | null => {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const code = ch.charCodeAt(0);
    if (code <= 0xff && !(code >= 0x80 && code <= 0x9f)) {
      bytes[i] = code;
      continue;
    }
    const mapped = CP1252_HIGH[ch];
    if (mapped === undefined) return null;
    bytes[i] = mapped;
  }
  return bytes;
};

/**
 * Vraća popravljen tekst kad je prepoznato dvostruko kodiranje,
 * inače izvorni tekst nepromijenjen.
 */
export const fixMojibake = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  if (value.length === 0 || !SUSPECT.test(value)) return value;

  const bytes = toCp1252Bytes(value);
  if (!bytes) return value;

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return CROATIAN.test(decoded) ? decoded : value;
  } catch {
    return value;
  }
};
