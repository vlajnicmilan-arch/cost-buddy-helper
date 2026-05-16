// Centralni PDF branding helper za sve V&M Balance izvještaje.
// - Embed-a Inter font (Regular + Bold) → puna UTF-8 podrška (č, ć, ž, đ, š, Σ, €)
//   i rješava jsPDF Helvetica-Bold bug s razmacima među slovima.
// - Definira brand boje (teal HSL 172 66% 40%) i jedinstveni tableTheme za autoTable.
import type { jsPDF as JsPDFType } from 'jspdf';
import { interRegularBase64 } from '@/assets/fonts/interRegular';
import { interBoldBase64 } from '@/assets/fonts/interBold';

// HSL 172 66% 40% (primary teal) → RGB
export const BRAND_TEAL: [number, number, number] = [35, 170, 145];
export const BRAND_TEAL_LIGHT: [number, number, number] = [230, 247, 243];
export const BRAND_DARK: [number, number, number] = [15, 23, 42];
export const BRAND_MUTED: [number, number, number] = [100, 116, 139];

let fontsRegistered = new WeakSet<object>();

/** Registers Inter Regular + Bold on the jsPDF doc and sets it as the active font. */
export const applyBrandFont = (doc: JsPDFType): void => {
  // Each jsPDF instance is independent; VFS lives on the instance.
  if (fontsRegistered.has(doc)) {
    doc.setFont('Inter', 'normal');
    return;
  }
  try {
    doc.addFileToVFS('Inter-Regular.ttf', interRegularBase64);
    doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
    doc.addFileToVFS('Inter-Bold.ttf', interBoldBase64);
    doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
    doc.setFont('Inter', 'normal');
    fontsRegistered.add(doc);
  } catch (e) {
    console.warn('[pdfBranding] Inter font registration failed, falling back to Helvetica', e);
  }
};

/** Common autoTable theme. Spread into autoTable options. */
export const brandTableTheme = {
  theme: 'striped' as const,
  styles: { font: 'Inter', fontSize: 9, cellPadding: 3, textColor: BRAND_DARK },
  headStyles: {
    font: 'Inter',
    fontStyle: 'bold' as const,
    fillColor: BRAND_TEAL,
    textColor: [255, 255, 255] as [number, number, number],
    fontSize: 9,
  },
  alternateRowStyles: { fillColor: BRAND_TEAL_LIGHT },
};

export const formatBrandCurrency = (
  amount: number,
  currency?: { code?: string; locale?: string },
): string => {
  try {
    return new Intl.NumberFormat(currency?.locale || 'hr-HR', {
      style: 'currency',
      currency: currency?.code || 'EUR',
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency?.code || 'EUR'}`;
  }
};

/**
 * Wrapper around autoTable that merges brand theme (Inter font, teal header,
 * alternating row backgrounds) with caller-provided options. Caller options win.
 */
export const brandAutoTable = (
  doc: JsPDFType,
  autoTable: (doc: JsPDFType, opts: any) => void,
  opts: any,
): void => {
  const merged: any = {
    ...brandTableTheme,
    ...opts,
    styles: { ...brandTableTheme.styles, ...(opts?.styles || {}) },
    headStyles: { ...brandTableTheme.headStyles, ...(opts?.headStyles || {}) },
    alternateRowStyles: { ...brandTableTheme.alternateRowStyles, ...(opts?.alternateRowStyles || {}) },
  };
  autoTable(doc, merged);
};
