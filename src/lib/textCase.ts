/**
 * Sentence-case auto-capitalization util.
 *
 * Cilj: mekan pomoćni sloj. Kapitalizira SAMO novo dodani znak ako je
 *   (a) na indexu 0, ili
 *   (b) odmah nakon `[.!?]` + razmak(a).
 *
 * NE dira sredinu riječi, NE mijenja retroaktivno postojeći tekst,
 * NE bori se s korisnikom (anti-borba preko `lastCappedIdx`).
 *
 * Hrvatski dijakritici: koristi `toLocaleUpperCase('hr-HR')`.
 */

const LETTER_RE = /\p{L}/u;
const SENTENCE_END_RE = /[.!?]\s+$/;

export interface CapitalizeResult {
  value: string;
  cappedIdx: number | null;
}

/**
 * Ako je korisnik upravo dodao točno jedan znak na kraj umetka, i taj znak
 * je slovo koje pripada početku rečenice, vrati verziju s velikim slovom.
 * Inače vrati next nepromijenjen.
 *
 * @param prev             prethodna vrijednost inputa
 * @param next             nova vrijednost (nakon korisnikovog unosa)
 * @param lastCappedIdx    index znaka koji smo prethodno auto-kapitalizirali
 *                         (za anti-borbu — ako ga korisnik vrati na malo,
 *                         ne kapitaliziramo ponovno)
 */
export function capitalizeNewChar(
  prev: string,
  next: string,
  lastCappedIdx: number | null,
): CapitalizeResult {
  // Brisanje ili nema promjene — ne diramo.
  if (next.length <= prev.length) {
    // Ako je korisnik obrisao preko lastCappedIdx, resetiraj marker.
    const newLastIdx =
      lastCappedIdx !== null && lastCappedIdx >= next.length ? null : lastCappedIdx;
    return { value: next, cappedIdx: newLastIdx };
  }

  const diff = next.length - prev.length;

  // Nađi index prvog znaka koji se razlikuje.
  let insertStart = 0;
  while (
    insertStart < prev.length &&
    insertStart < next.length &&
    prev[insertStart] === next[insertStart]
  ) {
    insertStart++;
  }

  // Ako je umetnut više od jednog znaka (paste), kapitaliziraj samo ako
  // je umetak počeo na indexu 0. Inače nemoj dirati paste sadržaj.
  if (diff > 1 && insertStart !== 0) {
    return { value: next, cappedIdx: lastCappedIdx };
  }

  // Ako korisnik prepisuje slovo koje smo mi kapitalizirali (npr. Backspace
  // pa upiše malo slovo), NE kapitaliziraj ponovno na istom indexu.
  if (lastCappedIdx !== null && insertStart === lastCappedIdx) {
    return { value: next, cappedIdx: null };
  }

  const inserted = next[insertStart];
  if (!inserted || !LETTER_RE.test(inserted)) {
    return { value: next, cappedIdx: lastCappedIdx };
  }

  // Prije umetka — je li početak polja ili nakon [.!?]\s+ ?
  const before = next.slice(0, insertStart);
  const atStart = before.length === 0 || /^\s*$/.test(before);
  const afterSentenceEnd = SENTENCE_END_RE.test(before);

  if (!atStart && !afterSentenceEnd) {
    return { value: next, cappedIdx: lastCappedIdx };
  }

  const upper = inserted.toLocaleUpperCase('hr-HR');
  if (upper === inserted) {
    // Već je veliko (npr. korisnik sam otipkao veliko slovo).
    return { value: next, cappedIdx: lastCappedIdx };
  }

  const capped = next.slice(0, insertStart) + upper + next.slice(insertStart + 1);
  return { value: capped, cappedIdx: insertStart };
}
