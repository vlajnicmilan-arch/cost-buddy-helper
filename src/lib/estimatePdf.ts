// PDF generator za ponude (interna verzija — NIJE službeni porezni dokument).
// Reuse: pdfBranding (Inter font, teal), pdfFooter (disclaimer), fileExport.
import { loadJsPdf } from './loadJsPdf';
import { applyBrandFont, brandAutoTable, BRAND_TEAL, BRAND_DARK, BRAND_MUTED } from './pdfBranding';
import { addNotOfficialFooter } from './pdfFooter';
import { exportPDFDoc, type ExportMode } from './fileExport';
import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';
import type { ProjectEstimate } from '@/hooks/useProjectEstimates';

interface BusinessHeader {
  company_name: string;
  oib?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  iban?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logo_url?: string | null;
  is_vat_payer?: boolean | null;
}

const t = (key: string, fallback: string) => {
  try {
    const v = i18n.t(key, { defaultValue: fallback });
    return typeof v === 'string' ? v : fallback;
  } catch { return fallback; }
};

const fmt = (n: number, code = 'EUR') => {
  try {
    return new Intl.NumberFormat(i18n.language || 'hr-HR', { style: 'currency', currency: code }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(i18n.language || 'hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
  } catch { return iso; }
};

async function fetchBusinessHeader(businessProfileId: string): Promise<BusinessHeader | null> {
  const { data, error } = await supabase
    .from('business_profiles')
    .select('company_name, oib, address, city, postal_code, iban, email, phone, website, logo_url, is_vat_payer')
    .eq('id', businessProfileId)
    .single();
  if (error) return null;
  return data as BusinessHeader;
}

export interface GenerateEstimatePdfOpts {
  currency?: { code?: string };
  mode?: ExportMode;
}

export async function generateEstimatePdf(
  estimate: ProjectEstimate,
  opts: GenerateEstimatePdfOpts = {}
): Promise<boolean> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  applyBrandFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const currencyCode = opts.currency?.code || 'EUR';
  const business = await fetchBusinessHeader(estimate.business_profile_id);

  // ===== Header band (teal) =====
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(18);
  doc.text(t('estimates.pdf.title', 'PONUDA'), margin, 12);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(11);
  doc.text(estimate.estimate_number, margin, 20);

  // Right side: dates
  doc.setFontSize(9);
  const rightX = pageWidth - margin;
  doc.text(`${t('estimates.pdf.date', 'Datum')}: ${formatDate(estimate.created_at)}`, rightX, 12, { align: 'right' });
  if (estimate.valid_until) {
    doc.text(`${t('estimates.pdf.validUntil', 'Vrijedi do')}: ${formatDate(estimate.valid_until)}`, rightX, 18, { align: 'right' });
  }

  // ===== Issuer + Client blocks =====
  let y = 36;
  doc.setTextColor(...BRAND_MUTED);
  doc.setFontSize(8);
  doc.text(t('estimates.pdf.issuer', 'IZDAVATELJ'), margin, y);
  doc.text(t('estimates.pdf.client', 'PRIMATELJ'), pageWidth / 2 + 4, y);
  y += 4;
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(10);
  doc.text(business?.company_name || '—', margin, y);
  doc.text(estimate.client_name, pageWidth / 2 + 4, y);
  y += 5;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9);

  const issuerLines: string[] = [];
  if (business?.address) issuerLines.push(business.address);
  if (business?.postal_code || business?.city) issuerLines.push([business?.postal_code, business?.city].filter(Boolean).join(' '));
  if (business?.oib) issuerLines.push(`OIB: ${business.oib}`);
  if (business?.iban) issuerLines.push(`IBAN: ${business.iban}`);
  if (business?.email) issuerLines.push(business.email);
  if (business?.phone) issuerLines.push(business.phone);

  const clientLines: string[] = [];
  if (estimate.client_address) clientLines.push(estimate.client_address);
  if (estimate.client_oib) clientLines.push(`OIB: ${estimate.client_oib}`);

  const maxLines = Math.max(issuerLines.length, clientLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (issuerLines[i]) doc.text(issuerLines[i], margin, y + i * 4.2);
    if (clientLines[i]) doc.text(clientLines[i], pageWidth / 2 + 4, y + i * 4.2);
  }
  y += maxLines * 4.2 + 6;

  // ===== Items table =====
  const head = [[
    '#',
    t('estimates.pdf.itemDescription', 'Opis'),
    t('estimates.pdf.qty', 'Kol.'),
    t('estimates.pdf.unit', 'Jed.'),
    t('estimates.pdf.unitPrice', 'Cijena'),
    t('estimates.pdf.vatPct', 'PDV%'),
    t('estimates.pdf.lineTotal', 'Iznos'),
  ]];
  const body = estimate.items.map((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unit_price) || 0;
    const line = qty * price;
    return [
      String(idx + 1),
      it.description || '',
      qty.toString(),
      it.unit || '',
      fmt(price, currencyCode),
      `${Number(it.vat_rate) || 0}%`,
      fmt(line, currencyCode),
    ];
  });

  brandAutoTable(doc, autoTable, {
    startY: y,
    head,
    body,
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 8 },
      2: { halign: 'right', cellWidth: 14 },
      3: { cellWidth: 14 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 16 },
      6: { halign: 'right', cellWidth: 28 },
    },
  });

  // @ts-ignore — autoTable attaches lastAutoTable
  y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : y + 30;

  // ===== Totals =====
  const totalsX = pageWidth - margin - 70;
  const valX = pageWidth - margin;
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_DARK);
  doc.text(`${t('estimates.subtotal', 'Osnovica')}:`, totalsX, y);
  doc.text(fmt(Number(estimate.subtotal) || 0, currencyCode), valX, y, { align: 'right' });
  y += 5;
  doc.text(`${t('estimates.vat', 'PDV')}:`, totalsX, y);
  doc.text(fmt(Number(estimate.vat_amount) || 0, currencyCode), valX, y, { align: 'right' });
  y += 6;

  // Total bar
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(totalsX - 4, y - 4, pageWidth - margin - (totalsX - 4), 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(11);
  doc.text(`${t('estimates.total', 'Ukupno')}:`, totalsX, y + 1.5);
  doc.text(fmt(Number(estimate.total_amount) || 0, currencyCode), valX, y + 1.5, { align: 'right' });
  y += 12;

  // ===== Notes =====
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9);
  if (estimate.notes) {
    doc.setTextColor(...BRAND_MUTED);
    doc.text(t('estimates.notes', 'Napomena') + ':', margin, y);
    y += 4;
    doc.setTextColor(...BRAND_DARK);
    const noteLines = doc.splitTextToSize(estimate.notes, pageWidth - margin * 2);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4.2 + 4;
  }

  if (business && business.is_vat_payer === false) {
    doc.setTextColor(...BRAND_MUTED);
    doc.setFontSize(8);
    doc.text(
      t('estimates.pdf.nonVatNote', 'Izdavatelj nije obveznik PDV-a.'),
      margin, y
    );
    y += 5;
  }

  // ===== Disclaimer (above footer) =====
  doc.setTextColor(...BRAND_MUTED);
  doc.setFontSize(8);
  const disclaimer = t(
    'estimates.pdf.disclaimer',
    'Radni dokument za internu komunikaciju s klijentom. Nije porezni račun niti službena ponuda u smislu poreznih propisa.'
  );
  const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - margin * 2);
  const pageH = doc.internal.pageSize.getHeight();
  doc.text(disclaimerLines, margin, pageH - 22);

  // Standard "not official record" footer
  addNotOfficialFooter(doc);

  const fileName = `Ponuda_${estimate.estimate_number.replace(/[^\w-]/g, '_')}.pdf`;
  return exportPDFDoc(doc, fileName, opts.mode || 'save');
}
