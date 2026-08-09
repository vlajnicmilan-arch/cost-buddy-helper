/**
 * MAIL UVOZ — čista pravila oko tekstualnog sloja PDF-a (bez biblioteke).
 * Odvojeno od `pdfText.ts` kako bi bilo testabilno u vitestu.
 */

/** Čitamo prvih 10 stranica — dovoljno za zaglavlje računa, jeftino. */
export const MAX_TEXT_PAGES = 10;

/** Prag ispod kojeg tekst smatramo šumom skenera, a ne tekstualnim slojem. */
export const MIN_TEXT_LAYER_CHARS = 40;

export function joinPdfPages(pages: readonly string[]): string {
  return pages
    .slice(0, MAX_TEXT_PAGES)
    .map((page) => (page ?? '').replace(/\u0000/g, '').trim())
    .filter((page) => page.length > 0)
    .join('\n');
}

export function hasTextLayer(text: string | null | undefined): boolean {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  return cleaned.length >= MIN_TEXT_LAYER_CHARS;
}
