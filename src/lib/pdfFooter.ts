/**
 * Adds a "not official record" disclaimer footer to a jsPDF document.
 * Renders on the LAST page only at the bottom — keeps it compact and unobtrusive.
 * GDPR / labour law context: clarifies that exports are internal tracking, not official records.
 */
import type { jsPDF as JsPDFType } from 'jspdf';

export const addNotOfficialFooter = (doc: JsPDFType): void => {
  try {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      const line1 = 'Generirano iz Centar - alat za interno upravljanje projektima.';
      const line2 = 'Nije sluzbena evidencija u smislu Zakona o radu / Zakona o racunovodstvu / Zakona o porezu.';
      doc.text(line1, pageWidth / 2, pageHeight - 8, { align: 'center' });
      doc.text(line2, pageWidth / 2, pageHeight - 5, { align: 'center' });
      // Reset for any subsequent operations
      doc.setTextColor(0, 0, 0);
    }
  } catch (e) {
    console.warn('[addNotOfficialFooter] failed', e);
  }
};
