import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

interface BusinessProfile {
  company_name: string;
  oib?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  iban?: string | null;
  bank_name?: string | null;
  email?: string | null;
  phone?: string | null;
  is_vat_payer?: boolean | null;
  vat_id?: string | null;
}

interface Client {
  name: string;
  oib?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  email?: string | null;
}

interface InvoiceData {
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  total_amount: number;
  vat_amount: number;
  notes?: string | null;
  status: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount?: number;
  vat_rate?: number;
  total: number;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(amount);
};

export const generateInvoicePDF = (
  invoice: InvoiceData,
  items: InvoiceItem[],
  business: BusinessProfile,
  client?: Client | null
): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // --- Header: Business info ---
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(business.company_name, margin, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const bizLines: string[] = [];
  if (business.address) bizLines.push(business.address);
  if (business.postal_code || business.city) bizLines.push([business.postal_code, business.city].filter(Boolean).join(' '));
  if (business.oib) bizLines.push(`OIB: ${business.oib}`);
  if (business.vat_id) bizLines.push(`PDV ID: ${business.vat_id}`);
  if (business.iban) bizLines.push(`IBAN: ${business.iban}`);
  if (business.bank_name) bizLines.push(`Banka: ${business.bank_name}`);
  if (business.email) bizLines.push(business.email);
  if (business.phone) bizLines.push(business.phone);

  bizLines.forEach(line => {
    doc.text(line, margin, y);
    y += 3.5;
  });

  // --- Invoice title ---
  y += 6;
  doc.setTextColor(0);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`RAČUN ${invoice.invoice_number}`, margin, y);
  y += 10;

  // --- Dates ---
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Datum izdavanja: ${format(new Date(invoice.issue_date), 'dd.MM.yyyy.')}`, margin, y);
  if (invoice.due_date) {
    doc.text(`Datum dospijeća: ${format(new Date(invoice.due_date), 'dd.MM.yyyy.')}`, margin + 80, y);
  }
  y += 8;

  // --- Client info ---
  if (client) {
    doc.setFillColor(245, 245, 245);
    const clientBoxHeight = 22 + (client.oib ? 4 : 0);
    doc.roundedRect(margin, y, pageWidth - margin * 2, clientBoxHeight, 2, 2, 'F');
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text('KUPAC:', margin + 4, y);
    y += 4;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(client.name, margin + 4, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60);
    if (client.address) { doc.text(client.address, margin + 4, y); y += 3.5; }
    if (client.postal_code || client.city) { doc.text([client.postal_code, client.city].filter(Boolean).join(' '), margin + 4, y); y += 3.5; }
    if (client.oib) { doc.text(`OIB: ${client.oib}`, margin + 4, y); y += 3.5; }
    y += 4;
  }

  y += 4;

  // --- Items table ---
  const tableHeaders = ['#', 'Opis', 'Kol.', 'Jed.', 'Cijena', 'PDV %', 'Ukupno'];
  const tableData = items.map((item, i) => [
    String(i + 1),
    item.description,
    String(item.quantity),
    item.unit || 'kom',
    formatCurrency(item.unit_price),
    `${item.vat_rate ?? 25}%`,
    formatCurrency(item.total),
  ]);

  autoTable(doc, {
    startY: y,
    head: [tableHeaders],
    body: tableData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 14, halign: 'right' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // --- Totals ---
  const totalsX = pageWidth - margin - 60;
  const baseAmount = invoice.total_amount - invoice.vat_amount;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Osnovica:', totalsX, y);
  doc.text(formatCurrency(baseAmount), pageWidth - margin, y, { align: 'right' });
  y += 5;

  doc.text('PDV:', totalsX, y);
  doc.text(formatCurrency(invoice.vat_amount), pageWidth - margin, y, { align: 'right' });
  y += 6;

  doc.setDrawColor(200);
  doc.line(totalsX, y, pageWidth - margin, y);
  y += 5;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('UKUPNO:', totalsX, y);
  doc.text(formatCurrency(invoice.total_amount), pageWidth - margin, y, { align: 'right' });
  y += 10;

  // --- Payment info ---
  if (business.iban) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text('Podaci za plaćanje:', margin, y);
    y += 4;
    doc.setTextColor(0);
    doc.text(`IBAN: ${business.iban}`, margin, y);
    y += 3.5;
    if (business.bank_name) { doc.text(`Banka: ${business.bank_name}`, margin, y); y += 3.5; }
    doc.text(`Poziv na broj: ${invoice.invoice_number}`, margin, y);
    y += 6;
  }

  // --- Notes ---
  if (invoice.notes) {
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Napomene:', margin, y);
    y += 4;
    doc.setTextColor(60);
    const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(noteLines, margin, y);
  }

  return doc;
};

export const downloadInvoicePDF = (
  invoice: InvoiceData,
  items: InvoiceItem[],
  business: BusinessProfile,
  client?: Client | null
) => {
  const doc = generateInvoicePDF(invoice, items, business, client);
  const fileName = `Racun_${invoice.invoice_number.replace(/\//g, '-')}.pdf`;
  doc.save(fileName);
};

export const shareInvoicePDF = async (
  invoice: InvoiceData,
  items: InvoiceItem[],
  business: BusinessProfile,
  client?: Client | null
) => {
  const doc = generateInvoicePDF(invoice, items, business, client);
  const fileName = `Racun_${invoice.invoice_number.replace(/\//g, '-')}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `Račun ${invoice.invoice_number}`,
      files: [file],
    });
  } else {
    // Fallback to download
    doc.save(fileName);
  }
};
