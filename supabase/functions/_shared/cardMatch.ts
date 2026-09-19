/**
 * CARD MATCH — Deno zrcalo modula `src/lib/cardMatch.ts`.
 *
 * NE mijenjaj ovu datoteku ručno bez iste izmjene u `src/lib/cardMatch.ts`:
 * jezgra između SHARED CORE markera mora biti bajt-identična, što provjerava
 * `src/lib/__tests__/cardMatchMirror.test.ts`.
 */

// ---------------- SHARED CORE START ----------------

/** Maska kartice pronađena u tekstu bankovnog retka. */
export interface CardMask {
  /** Zadnje 4 znamenke — jedino po čemu se uparuje. */
  readonly last4: string;
  /** Prvih 6 znamenki (BIN) kad ih maska nosi. */
  readonly bin: string | null;
  /** Doslovan isječak iz teksta — ide u sirovi zapis kao dokaz. */
  readonly raw: string;
}

/** Korisnikova upisana kartica. */
export interface UserCardRef {
  readonly id: string;
  readonly last_four_digits: string | null;
  readonly payment_source_id: string;
}

export interface CardMatchResult {
  readonly cardId: string;
  readonly paymentSourceId: string;
  readonly last4: string;
}

const MASK_PATTERNS: readonly RegExp[] = [
  // 462765XXXXXX2081 / 416598******1542 / 416598 **** 1542
  /(\d{6})\s*[x\*\u2022\.\-\s]{4,10}(\d{4})/gi,
  // **5385* / ****5385 / *** 5385
  /[\*\u2022]{2,}\s*(\d{4})/g,
  // Kartica: …1542 / Kartica 1542 / card: 1542
  /(?:kartica|kartice|card)\s*[:\-]?\s*[^\dA-Za-z]{0,6}(\d{4})(?!\d)/gi,
  // Visa *1234 / Mastercard ****1234 / Maestro 1234
  /(?:visa|mastercard|maestro|amex|diners|mc)\s*[\*\u2022\s\-]{0,6}(\d{4})(?!\d)/gi,
];

const isFour = (value: string | null | undefined): boolean =>
  typeof value === 'string' && /^\d{4}$/.test(value);

/**
 * Izvlači sve maske kartica iz teksta bankovnog retka.
 * Rezultat je bez duplikata, redoslijedom pojavljivanja.
 */
export function extractCardMasks(text: string | null | undefined): CardMask[] {
  const src = String(text ?? '');
  if (!src) return [];

  const found: CardMask[] = [];
  const seen = new Set<string>();

  for (const pattern of MASK_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const hasBin = m.length > 2 && isFour(m[2]);
      const last4 = hasBin ? m[2] : m[1];
      if (!isFour(last4)) continue;
      const bin = hasBin && /^\d{6}$/.test(m[1]) ? m[1] : null;
      const key = `${bin ?? ''}:${last4}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ last4, bin, raw: m[0].trim() });
    }
  }

  return found;
}

/**
 * Deterministički pogodak u korisnikove kartice.
 * Više različitih kartica ili nijedna → `null`.
 */
export function matchUserCard(
  masks: readonly CardMask[],
  cards: readonly UserCardRef[],
): CardMatchResult | null {
  if (!masks.length || !cards.length) return null;

  const wanted = new Set(masks.map((m) => m.last4));
  const hits: CardMatchResult[] = [];
  const seenCardIds = new Set<string>();

  for (const card of cards) {
    const last4 = String(card.last_four_digits ?? '').trim();
    if (!isFour(last4)) continue;
    if (!wanted.has(last4)) continue;
    if (seenCardIds.has(card.id)) continue;
    seenCardIds.add(card.id);
    hits.push({ cardId: card.id, paymentSourceId: card.payment_source_id, last4 });
  }

  if (hits.length !== 1) return null;
  return hits[0];
}

/** Skraćeni prikaz maski za sirovi zapis / dijagnostiku. */
export function describeCardMasks(masks: readonly CardMask[]): string[] {
  return masks.map((m) => (m.bin ? `${m.bin}…${m.last4}` : `…${m.last4}`));
}

// ---------------- SHARED CORE END ----------------
