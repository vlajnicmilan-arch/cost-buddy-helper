// Unified header/footer/watermark helpers for all V&M Balance PDF reports.
// Pair with `pdfBranding.ts` (font + table theme) and `reportDesign.ts` (tokens).
//
// Visual language: Variant B — teal-tinted header card with logo + eyebrow
// (owner · date), bold title, optional subtitle, optional confidentiality
// badge top-right; footer with page X of Y and intended-for line.
import type { jsPDF as JsPDFType } from 'jspdf';
import { applyBrandFont, BRAND_TEAL, BRAND_DARK, BRAND_MUTED } from '@/lib/pdfBranding';
import {
  REPORT_COLORS,
  formatBrandDate,
  type ConfidentialityLevel,
  type ReportBrandOptions,
} from '@/lib/reportDesign';
import { getReportLogoDataUrl } from '@/lib/reportLogo';

const hexToRgb = (hex: string): [number, number, number] => {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};

const PAGE_MARGIN_X = 14;
const HEADER_HEIGHT = 38; // mm — height of teal-tinted header card

export interface DrawHeaderInput {
  title: string;
  brand: ReportBrandOptions;
  // optional override label for the confidentiality strip ('Interno' / 'Povjerljivo')
  confidentialityLabel?: { internal: string; confidential: string };
}

/**
 * Draws the standard header card on the current page and returns the Y
 * position where body content should start (mm).
 */
export const drawReportHeader = (doc: JsPDFType, input: DrawHeaderInput): number => {
  applyBrandFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = PAGE_MARGIN_X;
  const y = 10;
  const w = pageWidth - PAGE_MARGIN_X * 2;
  const h = HEADER_HEIGHT;

  // Card background (teal tint)
  const tint = hexToRgb(REPORT_COLORS.tealTint);
  doc.setFillColor(tint[0], tint[1], tint[2]);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');

  // Left teal accent bar
  doc.setFillColor(BRAND_TEAL[0], BRAND_TEAL[1], BRAND_TEAL[2]);
  doc.roundedRect(x, y, 2.5, h, 1.2, 1.2, 'F');

  // Logo (real PNG if cached, else vector wordmark fallback)
  const logoX = x + 8;
  const logoY = y + 6;
  const logoH = 11;
  const wordmarkOffsetX = drawLogo(doc, logoX, logoY, logoH);

  // Wordmark "Balance" beside logo
  const deep = hexToRgb(REPORT_COLORS.tealDeep);
  doc.setTextColor(deep[0], deep[1], deep[2]);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(12);
  doc.text('V&M Balance', logoX + wordmarkOffsetX, logoY + 7.5);

  // Eyebrow line: OWNER · DATE
  const owner = (input.brand.owner || '').trim();
  const dateStr = formatBrandDate(new Date(), input.brand.language);
  const eyebrowParts = [owner.toUpperCase(), dateStr].filter(Boolean);
  if (eyebrowParts.length > 0) {
    doc.setFontSize(7.5);
    doc.setFont('Inter', 'normal');
    doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
    doc.text(eyebrowParts.join('  ·  '), x + 8, y + 21);
  }

  // Title
  doc.setFontSize(17);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
  doc.text(input.title, x + 8, y + 29);

  // Subtitle
  if (input.brand.subtitle) {
    doc.setFontSize(9.5);
    doc.setFont('Inter', 'normal');
    doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
    doc.text(input.brand.subtitle, x + 8, y + 35);
  }

  // Confidentiality badge top-right
  const level = input.brand.confidentiality || 'none';
  if (level !== 'none' && input.confidentialityLabel) {
    const label = level === 'confidential' ? input.confidentialityLabel.confidential : input.confidentialityLabel.internal;
    drawBadge(doc, x + w - 8, y + 8, label, level === 'confidential');
  }

  // Reset colors
  doc.setTextColor(0, 0, 0);

  return y + h + 6;
};

/**
 * Draws the logo at (x, y) with given height (mm). Returns x-offset where
 * the wordmark should start (logo width + small gap).
 */
const drawLogo = (doc: JsPDFType, x: number, y: number, h: number): number => {
  const dataUrl = getReportLogoDataUrl();
  if (dataUrl) {
    try {
      doc.addImage(dataUrl, 'PNG', x, y, h, h, undefined, 'FAST');
      return h + 3;
    } catch (e) {
      console.warn('[pdfReportKit] addImage failed, using fallback', e);
    }
  }
  // Fallback: teal rounded square with "V&M"
  doc.setFillColor(BRAND_TEAL[0], BRAND_TEAL[1], BRAND_TEAL[2]);
  doc.roundedRect(x, y, h, h, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(7);
  doc.text('V&M', x + h / 2, y + h / 2 + 1.2, { align: 'center' });
  return h + 3;
};

const drawBadge = (doc: JsPDFType, rightX: number, y: number, label: string, accent: boolean): void => {
  doc.setFont('Inter', 'bold');
  doc.setFontSize(7.5);
  const text = label.toUpperCase();
  const padX = 2.5;
  const w = doc.getTextWidth(text) + padX * 2;
  const h = 5;
  const x = rightX - w;
  if (accent) {
    doc.setFillColor(BRAND_TEAL[0], BRAND_TEAL[1], BRAND_TEAL[2]);
    doc.roundedRect(x, y, w, h, 1.2, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
  } else {
    const bg = hexToRgb(REPORT_COLORS.badgeSlateBg);
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.roundedRect(x, y, w, h, 1.2, 1.2, 'F');
    const fg = hexToRgb(REPORT_COLORS.badgeSlate);
    doc.setTextColor(fg[0], fg[1], fg[2]);
  }
  doc.text(text, x + padX, y + h - 1.5);
};

export interface DrawFooterInput {
  brand: ReportBrandOptions;
  intendedForLabel?: string;  // localized e.g. "Namijenjeno: Milan"
  pageLabel?: string;          // localized e.g. "Stranica {{n}} / {{total}}"
  disclaimer?: string;         // optional second small line
}

/**
 * Adds footer on every page: optional intendedFor line + page X / Y.
 * Optional watermark when confidentiality === 'confidential'.
 */
export const drawReportFooter = (doc: JsPDFType, input: DrawFooterInput): void => {
  const total = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const level: ConfidentialityLevel = input.brand.confidentiality || 'none';

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    // Watermark
    if (level === 'confidential') {
      drawConfidentialWatermark(doc);
    }

    // Footer text — suptilno, ne dominira nad sadržajem
    doc.setFont('Inter', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184); // slate-400, lakše od BRAND_MUTED

    // Left: intendedFor (only when there's a confidentiality label)
    if (level !== 'none' && input.intendedForLabel) {
      doc.text(input.intendedForLabel, PAGE_MARGIN_X, pageHeight - 8);
    }

    // Right: page X / Y
    if (input.pageLabel) {
      const label = input.pageLabel.replace('{{n}}', String(i)).replace('{{total}}', String(total));
      doc.text(label, pageWidth - PAGE_MARGIN_X, pageHeight - 8, { align: 'right' });
    }

    // Optional disclaimer line
    if (input.disclaimer) {
      doc.setFontSize(6.5);
      doc.text(input.disclaimer, pageWidth / 2, pageHeight - 4, { align: 'center' });
    }

    doc.setTextColor(0, 0, 0);
  }
};

const drawConfidentialWatermark = (doc: JsPDFType): void => {
  try {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const anyDoc = doc as any;
    if (typeof anyDoc.saveGraphicsState === 'function' && typeof anyDoc.setGState === 'function' && typeof anyDoc.GState === 'function') {
      anyDoc.saveGraphicsState();
      anyDoc.setGState(new anyDoc.GState({ opacity: 0.045 }));
      doc.setFont('Inter', 'bold');
      doc.setFontSize(72);
      doc.setTextColor(BRAND_TEAL[0], BRAND_TEAL[1], BRAND_TEAL[2]);
      doc.text('POVJERLJIVO', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
      anyDoc.restoreGraphicsState();
    } else {
      // Fallback (no GState): faint gray text
      doc.setFont('Inter', 'bold');
      doc.setFontSize(72);
      doc.setTextColor(220, 230, 228);
      doc.text('POVJERLJIVO', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
    }
    doc.setTextColor(0, 0, 0);
  } catch (e) {
    console.warn('[pdfReportKit] watermark failed', e);
  }
};

/** Margin constant so callers can align body content with header card. */
export const REPORT_MARGIN_X = PAGE_MARGIN_X;
