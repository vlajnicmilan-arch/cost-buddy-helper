/**
 * MAIL UVOZ — brojanje stranica PDF-a i granica obrade.
 *
 * PDF preko 30 stranica NE odbijamo: obradimo prvih 30, stavku OZNAČIMO
 * nepotpunom i pouzdanost tvrdo spustimo na 'niska'. Korisnik uvijek vidi da
 * dokument nije pročitan do kraja.
 */

export const MAX_PDF_PAGES = 30;

const decodeLatin1 = (bytes: Uint8Array): string => {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
};

/**
 * Broj stranica bez pune PDF biblioteke:
 *   1) `/Type /Pages ... /Count N` u katalogu stranica (mjerodavno),
 *   2) fallback: broj `/Type /Page` objekata.
 * Vraća `null` kad se ništa ne može pročitati (npr. kriptiran PDF).
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  const text = decodeLatin1(bytes);

  let best: number | null = null;
  const countRe = /\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = countRe.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && (best === null || n > best)) best = n;
  }
  if (best !== null && best > 0) return best;

  const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
  if (pageMatches && pageMatches.length > 0) return pageMatches.length;

  return null;
}

export interface PdfPageVerdict {
  pageCount: number | null;
  pagesToProcess: number | null;
  /** Dokument je duži od granice — obrađuje se djelomično. */
  incomplete: boolean;
  /** Kad je `incomplete`, pouzdanost se tvrdo obara. */
  forcedConfidence: 'niska' | null;
}

export function evaluatePdfPages(bytes: Uint8Array): PdfPageVerdict {
  const pageCount = countPdfPages(bytes);
  if (pageCount === null) {
    return { pageCount: null, pagesToProcess: null, incomplete: false, forcedConfidence: null };
  }
  const incomplete = pageCount > MAX_PDF_PAGES;
  return {
    pageCount,
    pagesToProcess: Math.min(pageCount, MAX_PDF_PAGES),
    incomplete,
    forcedConfidence: incomplete ? 'niska' : null,
  };
}
