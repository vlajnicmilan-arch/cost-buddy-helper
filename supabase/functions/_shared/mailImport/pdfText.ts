/**
 * MAIL UVOZ — tekstualni sloj PDF-a. BESPLATNO, PRIJE ikakvog AI-ja.
 *
 * Biblioteka: `unpdf` (pdf.js serverless build, radi u Denu bez binarnih
 * ovisnosti). Odabrana jer nema Node-only API-ja i ne traži worker/canvas.
 *
 * Ovaj most se NE uvozi iz vitest testova (remote import) — čista pravila
 * odluke žive u `pdfTextRules.ts` i pokrivena su testovima.
 */

import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';
import { MAX_TEXT_PAGES, hasTextLayer, joinPdfPages } from './pdfTextRules.ts';

export interface PdfTextResult {
  text: string;
  /** Prazan tekstualni sloj = sken → jedini put koji smije ići multimodalno. */
  isScan: boolean;
  pagesRead: number;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [String(text ?? '')]).slice(0, MAX_TEXT_PAGES);
    const joined = joinPdfPages(pages);
    return { text: joined, isScan: !hasTextLayer(joined), pagesRead: pages.length };
  } catch (e) {
    console.warn('[mail-process] PDF tekstualni sloj nije pročitan', (e as Error)?.message);
    return { text: '', isScan: true, pagesRead: 0 };
  }
}
