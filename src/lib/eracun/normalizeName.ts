/**
 * eRačun — usporedba naziva druge strane (token-subset).
 *
 * Namjerno BEZ mjere sličnosti (Levenshtein, Jaro-Winkler) i bez pragova:
 * takav rezultat se poslije ne može objasniti korisniku ni obraniti. Umjesto
 * toga: normalizacija → tokeni → kraći naziv mora biti PODSKUP dužeg.
 *
 * Primjer iz stvarnih podataka:
 *   izvod:  „BAMI INTERIJER GRAĐEVINSKI OBRT OSIJEK"
 *   račun:  „BAMI INTERIJER građevinski obrt, vl. Ivica Galić"
 *   tokeni: {bami, interijer} ⊂ {bami, interijer} → pogodak
 *
 * Zaštita od lažnih pogodaka: kraći naziv mora imati barem 2 značajna tokena,
 * pa sam „obrt" ili sam „bami" nikad ne prolazi.
 */

/** Pravni oblici, generičke djelatnosti i gradovi — šum, ne identitet. */
const STOPWORDS = new Set([
  'doo', 'jdoo', 'dd', 'kd', 'obrt', 'obrta', 'vl', 'vlasnik', 'ltd', 'gmbh', 'sp',
  'gradevinski', 'gradevinska', 'gradnja', 'zanatski', 'trgovina', 'trgovacki',
  'usluge', 'uslugu', 'servis', 'proizvodnja', 'obrtnik', 'tvrtka', 'company',
  'osijek', 'zagreb', 'split', 'rijeka', 'varazdin', 'zadar', 'pula', 'sisak',
  'karlovac', 'vukovar', 'dubrovnik', 'slavonski', 'brod', 'velika', 'gorica',
]);

const DIACRITICS: Record<string, string> = {
  č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'd',
};

/** Mala slova, dijakritici → ASCII, sve ostalo osim slova i brojki → razmak. */
export const normalizeCompanyName = (value: string | null | undefined): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/[čćžšđ]/g, (ch) => DIACRITICS[ch] ?? ch)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Značajni tokeni: duljina ≥ 3 i nisu na popisu šuma. */
export const nameTokens = (value: string | null | undefined): string[] => {
  const seen = new Set<string>();
  for (const token of normalizeCompanyName(value).split(' ')) {
    if (token.length < 3) continue;
    if (STOPWORDS.has(token)) continue;
    seen.add(token);
  }
  return [...seen];
};

/**
 * `true` kad je kraći skup tokena u cijelosti sadržan u dužem
 * i ima barem 2 tokena.
 */
export const namesMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shorter.length < 2) return false;
  const set = new Set(longer);
  return shorter.every((token) => set.has(token));
};
