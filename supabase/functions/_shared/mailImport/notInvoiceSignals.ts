/**
 * MAIL UVOZ — izjava pošiljatelja „ovo nije račun".
 *
 * Povod (živi kvar, kolovoz 2026.): Meta potvrde o naplati oglasa u prvoj
 * rečenici doslovno pišu „Ovo nije faktura." — bez privitka, bez broja
 * dokumenta, bez poreza. Klasifikator ih je puštao u `nepoznato` / red za
 * čovjeka iako pošiljatelj SAM kaže da dokument nije račun.
 *
 * Pogađa SAMO samostalnu izjavu: fraza mora biti na početku retka ili odmah
 * iza kraja rečenice. Gola riječ „faktura"/„račun" nigdje u tekstu NE smije
 * ništa pokrenuti (npr. „platite fakturu do petka" ostaje račun-put).
 */

const PHRASES: readonly string[] = [
  // hrvatski
  'ovo nije faktura',
  'ovo nije racun',
  'nije faktura',
  'nije racun',
  // engleski
  'this is not an invoice',
  'this is not a tax invoice',
  'not a tax invoice',
  // njemački
  'dies ist keine rechnung',
  'keine rechnung',
];

/** đ/Đ nemaju NFD rastav — moraju ručno, inače „račun" s đ ostane nevidljiv. */
const HARD_MAP: Record<string, string> = {
  đ: 'd',
  ǆ: 'dz',
  ł: 'l',
  ø: 'o',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
};

export function normalizeForDeclaration(input: string): string {
  let text = input.toLowerCase();
  // Skinuti HTML prije svega — oznake ne smiju „zalijepiti" riječi ni
  // prekinuti rečenicu na lažnom mjestu.
  text = text.replace(/<[^>]*>/g, ' ');
  text = text
    .split('')
    .map((ch) => HARD_MAP[ch] ?? ch)
    .join('');
  text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Skupljeni razmaci; interpunkcija osim završnica rečenica postaje razmak.
  text = text.replace(/[ \t ]+/g, ' ');
  return text;
}

/** Rečenice/retci — fraza se traži na početku segmenta. */
const toSegments = (normalized: string): string[] =>
  normalized
    .split(/[.!?…\n;]+/)
    .map((s) => s.replace(/^[\s"'„"'\-–—*•:,]+/, '').trim())
    .filter((s) => s.length > 0);

export function detectNotInvoiceDeclaration(text: string | null | undefined): {
  matched: boolean;
  phrase: string | null;
} {
  if (!text || text.trim().length === 0) return { matched: false, phrase: null };
  const segments = toSegments(normalizeForDeclaration(text));
  for (const segment of segments) {
    for (const phrase of PHRASES) {
      // Fraza na početku segmenta; iza nje smije biti kraj ili razmak/završnica.
      if (segment === phrase || segment.startsWith(phrase + ' ')) {
        return { matched: true, phrase: segment };
      }
    }
  }
  return { matched: false, phrase: null };
}
