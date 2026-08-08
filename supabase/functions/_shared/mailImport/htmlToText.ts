/**
 * MAIL UVOZ — pretvorba HTML tijela poruke u čist tekst.
 *
 * TVRDO PRAVILO: nijedan mrežni dohvat. Ne učitavamo slike, stilove, fontove
 * ni bilo koji vanjski resurs. Sve što bi moglo pozvati mrežu (img, script,
 * iframe, link, object, embed, video, audio, source) uklanja se zajedno sa
 * sadržajem PRIJE ikakve daljnje obrade. Rezultat je isključivo tekst.
 */

const VOID_NETWORK_TAGS = ['img', 'source', 'track', 'input', 'embed', 'link', 'base'];
const BLOCK_NETWORK_TAGS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object',
  'video', 'audio', 'picture', 'svg', 'applet', 'canvas',
];

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', eacute: 'é', scaron: 'š', ccaron: 'č',
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[String(name).toLowerCase()] ?? whole);

/** URL-ovi pronađeni u tekstu i href atributima — SAMO kao podaci, nikad se ne dohvaćaju. */
export function extractLinks(html: string): string[] {
  const out: string[] = [];
  const hrefRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) out.push(decodeEntities(m[1]).trim());

  const bareRe = /https?:\/\/[^\s"'<>()]+/gi;
  const stripped = html.replace(/<[^>]*>/g, ' ');
  const bare = stripped.match(bareRe) ?? [];
  for (const url of bare) out.push(decodeEntities(url).trim());

  return Array.from(new Set(out));
}

export function htmlToText(html: string): string {
  if (!html) return '';
  let text = html;

  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  for (const tag of BLOCK_NETWORK_TAGS) {
    text = text.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
    // Nezatvoreni oblik — uklanjamo barem otvarajući tag.
    text = text.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), ' ');
  }
  for (const tag of VOID_NETWORK_TAGS) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), ' ');
  }

  text = text.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  text = text.replace(/<\/\s*(p|div|tr|li|h[1-6]|table)\s*>/gi, '\n');
  text = text.replace(/<[^>]*>/g, ' ');
  text = decodeEntities(text);
  text = text.replace(/[ \t\u00a0]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');

  return text.trim();
}

/** Provjera za čuvar-test: u očišćenom tekstu ne smije ostati resurs koji poziva mrežu. */
export function containsNetworkResource(html: string): boolean {
  const all = [...VOID_NETWORK_TAGS, ...BLOCK_NETWORK_TAGS];
  return all.some((tag) => new RegExp(`<${tag}\\b`, 'i').test(html));
}
