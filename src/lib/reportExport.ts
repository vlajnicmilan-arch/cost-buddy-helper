// jspdf + jspdf-autotable are heavy (~420 KB). Load them on demand only when
// a PDF export is actually requested, so they stay out of the initial bundle.
import type { jsPDF as JsPDFType } from 'jspdf';
import i18n from '@/i18n';
import { Expense, getCategoryInfo, getPaymentSourceInfo, getTransactionTypeInfo } from '@/types/expense';
import { exportPDFDoc, exportTextFile, type ExportMode } from '@/lib/fileExport';
import { sanitizeCsvField } from '@/lib/csvSecurity';
import { applyBrandFont, brandAutoTable } from '@/lib/pdfBranding';
import { drawReportHeader, drawReportFooter, REPORT_MARGIN_X } from '@/lib/pdfReportKit';
import { ensureReportLogo } from '@/lib/reportLogo';
import { buildReportFileName, loadLastConfidentiality, type ReportBrandOptions } from '@/lib/reportDesign';
import { getReportOwner } from '@/hooks/useReportOwner';

let pdfLibsPromise: Promise<{ jsPDF: typeof JsPDFType; autoTable: typeof import('jspdf-autotable').default }> | null = null;
const loadPdfLibs = () => {
  if (!pdfLibsPromise) {
    pdfLibsPromise = Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]).then(([jspdf, autotable]) => ({
      jsPDF: jspdf.default,
      autoTable: autotable.default,
    }));
  }
  return pdfLibsPromise;
};

export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
}

export interface ReportData {
  expenses: Expense[];
  dateRange: { start: Date; end: Date };
  totals: {
    income: number;
    expenses: number;
    balance: number;
    transfers: number;
  };
  byCategory: Record<string, number>;
  byPaymentSource: Record<string, number>;
  currency?: CurrencyConfig;
}

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('hr-HR');
};

const formatCurrency = (amount: number, currency?: CurrencyConfig): string => {
  const currencyCode = currency?.code || 'EUR';
  const locale = currency?.locale || 'hr-HR';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
};

// Convert Croatian characters to ASCII for PDF compatibility
const toAscii = (text: string): string => text;

// ===== Activity feed renderer (used by transaction & income reports) =====
interface FeedItem {
  date: Date;
  title: string;
  metaParts: string[];
  amount: number;
  signed: 'pos' | 'neg' | 'neutral';
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLabel = (d: Date, locale: string) =>
  d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Strip UUIDs, long hex chains and trailing numeric references from a
 * transaction description so PDF feed titles stay human-readable.
 * Examples cleaned:
 *  - "KEKS Pay - … Jadrolinija 304883586, e079598e-fb21-4a72-b819-a392f…"
 *    → "KEKS Pay - … Jadrolinija"
 *  - "WOLT ZAGREB, 3dd09f2b-c6bc-4603-…" → "WOLT ZAGREB"
 */
const cleanFeedTitle = (raw: string | undefined | null): string => {
  if (!raw) return '';
  let s = String(raw);
  // Remove full UUIDs
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '');
  // Remove standalone long hex strings (>=16 chars)
  s = s.replace(/\b[0-9a-f]{16,}\b/gi, '');
  // Remove trailing ", " left over from removed UUIDs
  s = s.replace(/[,\s]+(?=$|[,\s])/g, ' ');
  // Remove trailing standalone numeric reference (>=6 digits) at end
  s = s.replace(/[\s,–-]+\d{6,}\s*$/g, '');
  // Collapse whitespace and trim trailing punctuation
  s = s.replace(/\s+/g, ' ').replace(/[\s,;:–-]+$/g, '').trim();
  return s;
};

const drawTransactionFeed = (
  doc: JsPDFType,
  items: FeedItem[],
  currency: CurrencyConfig | undefined,
  startY: number,
  locale: string,
): void => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftX = REPORT_MARGIN_X;
  const rightX = pageWidth - REPORT_MARGIN_X;
  const bottomLimit = pageHeight - 25;

  const grouped = new Map<string, FeedItem[]>();
  for (const it of items) {
    const k = dayKey(it.date);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(it);
  }
  const sortedKeys = Array.from(grouped.keys()).sort().reverse();

  let y = startY;
  const ensureSpace = (h: number) => {
    if (y + h > bottomLimit) {
      doc.addPage();
      y = 25;
    }
  };

  for (const key of sortedKeys) {
    const dayItems = grouped.get(key)!;
    ensureSpace(10);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(toAscii(dayLabel(dayItems[0].date, locale)), leftX, y);
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.line(leftX, y, rightX, y);
    y += 2;

    for (let i = 0; i < dayItems.length; i++) {
      const it = dayItems[i];
      const hasMeta = it.metaParts.filter(Boolean).length > 0;
      const rowHeight = hasMeta ? 11 : 8;
      ensureSpace(rowHeight);
      const amountText = (it.signed === 'neg' ? '-' : it.signed === 'pos' ? '+' : '') +
        formatCurrency(Math.abs(it.amount), currency);

      doc.setFont('Inter', 'bold');
      doc.setFontSize(9.5);
      if (it.signed === 'neg') doc.setTextColor(220, 38, 38);
      else if (it.signed === 'pos') doc.setTextColor(22, 163, 74);
      else doc.setTextColor(15, 23, 42);
      const amountWidth = doc.getTextWidth(amountText);
      doc.text(amountText, rightX - amountWidth, y);

      doc.setFont('Inter', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      const maxTitleWidth = rightX - leftX - amountWidth - 6;
      let title = toAscii(cleanFeedTitle(it.title) || '—');
      if (doc.getTextWidth(title) > maxTitleWidth) {
        const r = maxTitleWidth / Math.max(doc.getTextWidth(title), 1);
        title = title.substring(0, Math.max(1, Math.floor(title.length * r) - 1)) + '…';
      }
      doc.text(title, leftX, y);

      const metaText = toAscii(it.metaParts.filter(Boolean).join(' · '));
      if (metaText) {
        doc.setFont('Inter', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const maxMetaWidth = rightX - leftX;
        let meta = metaText;
        if (doc.getTextWidth(meta) > maxMetaWidth) {
          const r = maxMetaWidth / Math.max(doc.getTextWidth(meta), 1);
          meta = meta.substring(0, Math.max(1, Math.floor(meta.length * r) - 1)) + '…';
        }
        doc.text(meta, leftX, y + 3.6);
      }

      y += rowHeight - 2;
      // Hairline separator between rows (skip after last item in day)
      if (i < dayItems.length - 1) {
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.1);
        doc.line(leftX, y, rightX, y);
      }
      y += 2;
    }

    y += 3;
  }
};


export const generatePDFReport = async (
  data: ReportData,
  reportTitle: string = 'Financijsko izvješće',
  mode: ExportMode = 'save',
  brand: ReportBrandOptions = {},
): Promise<void> => {
  const { jsPDF, autoTable } = await loadPdfLibs();
  await ensureReportLogo();
  const doc = new jsPDF();
  applyBrandFont(doc);

  // Resolve owner if not provided
  const language = (brand.language || (i18n.language as any) || 'hr') as 'hr' | 'en' | 'de';
  const owner = brand.owner ?? (await getReportOwner());
  const subtitle = brand.subtitle || `${i18n.t('reports.period')}: ${formatDate(data.dateRange.start)} – ${formatDate(data.dateRange.end)}`;
  const fullBrand: ReportBrandOptions = { owner, language, confidentiality: brand.confidentiality ?? loadLastConfidentiality(), subtitle };

  const bodyStartY = drawReportHeader(doc, {
    title: reportTitle,
    brand: fullBrand,
    confidentialityLabel: {
      internal: i18n.t('reportBranding.confidentiality.internal'),
      confidential: i18n.t('reportBranding.confidentiality.confidential'),
    },
  });

  doc.setFontSize(11);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(toAscii('Sažetak'), REPORT_MARGIN_X, bodyStartY + 2);

  const summaryData = [
    [toAscii('Ukupni prihodi'), formatCurrency(data.totals.income, data.currency)],
    [toAscii('Ukupni troškovi'), formatCurrency(data.totals.expenses, data.currency)],
    ['Stanje', formatCurrency(data.totals.balance, data.currency)],
    ['Prijenosi', formatCurrency(data.totals.transfers, data.currency)],
  ];

  brandAutoTable(doc, autoTable, {
    startY: bodyStartY + 5,
    head: [['Stavka', 'Iznos']],
    body: summaryData,
    margin: { left: REPORT_MARGIN_X },
    tableWidth: 90,
  });

  const categoryY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Troskovi po kategorijama'), 14, categoryY);

  const categoryData = Object.entries(data.byCategory)
    .filter(([_, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([categoryId, amount]) => {
      const info = getCategoryInfo(categoryId as any);
      const percentage = data.totals.expenses > 0 
        ? ((amount / data.totals.expenses) * 100).toFixed(1) 
        : '0';
      return [toAscii(info.name), formatCurrency(amount, data.currency), `${percentage}%`];
    });

  if (categoryData.length > 0) {
    brandAutoTable(doc, autoTable, {
      startY: categoryY + 4,
      head: [['Kategorija', 'Iznos', 'Udio']],
      body: categoryData,
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(toAscii(i18n.t('reports.transactionList', 'Popis transakcija') as string), REPORT_MARGIN_X, 20);

  const feedItems: FeedItem[] = data.expenses
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(expense => {
      const typeInfo = getTransactionTypeInfo(expense.type);
      const categoryInfo = getCategoryInfo(expense.category);
      const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
      const signed: 'pos' | 'neg' | 'neutral' =
        expense.type === 'expense' ? 'neg' : expense.type === 'income' ? 'pos' : 'neutral';
      const meta: string[] = [categoryInfo.name, paymentInfo.name];
      if (expense.type !== 'expense') meta.push(typeInfo.name);
      return {
        date: expense.date,
        title: expense.description || categoryInfo.name,
        metaParts: meta.filter(Boolean) as string[],
        amount: expense.amount,
        signed,
      };
    });

  drawTransactionFeed(doc, feedItems, data.currency, 28, language === 'hr' ? 'hr-HR' : language === 'de' ? 'de-DE' : 'en-US');


  const period = `${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}`.replace(/\./g, '-');
  const fileName = buildReportFileName({ type: 'izvjestaj', owner, period, ext: 'pdf' });
  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: i18n.t('reportBranding.pageXofY'),
    intendedForLabel: fullBrand.confidentiality !== 'none' && owner
      ? `${i18n.t('reportBranding.intendedFor')}: ${owner}`
      : undefined,
  });
  await exportPDFDoc(doc, fileName, mode);
};

export const generateCSVReport = async (data: ReportData, mode: ExportMode = 'save'): Promise<void> => {
  const headers = ['Datum', 'Tip', 'Opis', 'Kategorija', 'Način plaćanja', 'Iznos'];

  // CSV injection zaštita: tekstualna polja prolaze kroz sanitizeCsvField
  // (prefixira razmakom ako počinju s =, +, -, @). Vidi src/lib/csvSecurity.ts.
  const rows = data.expenses
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(expense => {
      const typeInfo = getTransactionTypeInfo(expense.type);
      const categoryInfo = getCategoryInfo(expense.category);
      const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
      const safeDesc = sanitizeCsvField(expense.description).replace(/"/g, '""');
      
      return [
        formatDate(expense.date),
        sanitizeCsvField(typeInfo.name),
        `"${safeDesc}"`,
        sanitizeCsvField(categoryInfo.name),
        sanitizeCsvField(paymentInfo.name),
        expense.type === 'expense' ? -expense.amount : expense.amount,
      ].join(',');
    });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const fileName = `transakcije_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.csv`;
  await exportTextFile(csvContent, fileName, 'text/csv', true, mode);
};

export const generateJSONExport = async (data: ReportData, mode: ExportMode = 'save'): Promise<void> => {
  const exportData = {
    generatedAt: new Date().toISOString(),
    dateRange: {
      start: data.dateRange.start.toISOString(),
      end: data.dateRange.end.toISOString(),
    },
    summary: data.totals,
    byCategory: data.byCategory,
    byPaymentSource: data.byPaymentSource,
    transactions: data.expenses.map(e => ({
      ...e,
      date: e.date.toISOString(),
    })),
  };

  const fileName = `financije_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.json`;
  await exportTextFile(JSON.stringify(exportData, null, 2), fileName, 'application/json', false, mode);
};

// ============= INCOME REPORT EXPORTS =============

export interface IncomeReportData {
  incomeTransactions: Expense[];
  dateRange: { start: Date; end: Date };
  totalIncome: number;
  byCategory: Record<string, number>;
  currency?: CurrencyConfig;
}

export const generateIncomePDFReport = async (
  data: IncomeReportData,
  reportTitle: string = 'Izvješće o prihodima',
  mode: ExportMode = 'save',
  brand: ReportBrandOptions = {},
): Promise<void> => {
  const { jsPDF, autoTable } = await loadPdfLibs();
  await ensureReportLogo();
  const doc = new jsPDF();
  applyBrandFont(doc);

  const language = (brand.language || (i18n.language as any) || 'hr') as 'hr' | 'en' | 'de';
  const owner = brand.owner ?? (await getReportOwner());
  const subtitle = brand.subtitle || `${i18n.t('reports.period')}: ${formatDate(data.dateRange.start)} – ${formatDate(data.dateRange.end)}`;
  const fullBrand: ReportBrandOptions = { owner, language, confidentiality: brand.confidentiality ?? loadLastConfidentiality(), subtitle };

  const bodyStartY = drawReportHeader(doc, {
    title: reportTitle,
    brand: fullBrand,
    confidentialityLabel: {
      internal: i18n.t('reportBranding.confidentiality.internal'),
      confidential: i18n.t('reportBranding.confidentiality.confidential'),
    },
  });

  doc.setFontSize(11);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(toAscii('Sažetak prihoda'), REPORT_MARGIN_X, bodyStartY + 2);

  const summaryData = [
    [toAscii('Ukupni prihodi'), formatCurrency(data.totalIncome, data.currency)],
    ['Broj transakcija', data.incomeTransactions.length.toString()],
  ];

  brandAutoTable(doc, autoTable, {
    startY: bodyStartY + 5,
    head: [['Stavka', 'Vrijednost']],
    body: summaryData,
    margin: { left: REPORT_MARGIN_X },
    tableWidth: 90,
  });

  const categoryY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Prihodi po kategorijama', 14, categoryY);

  const categoryData = Object.entries(data.byCategory)
    .filter(([_, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([categoryId, amount]) => {
      const percentage = data.totalIncome > 0 
        ? ((amount / data.totalIncome) * 100).toFixed(1) 
        : '0';
      return [toAscii(categoryId), formatCurrency(amount, data.currency), `${percentage}%`];
    });

  if (categoryData.length > 0) {
    brandAutoTable(doc, autoTable, {
      startY: categoryY + 4,
      head: [['Kategorija', 'Iznos', 'Udio']],
      body: categoryData,
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(toAscii(i18n.t('reports.incomeList', 'Popis prihoda') as string), REPORT_MARGIN_X, 20);

  const feedItems: FeedItem[] = data.incomeTransactions
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(income => {
      const paymentInfo = getPaymentSourceInfo(income.payment_source || 'cash');
      const categoryLabel = income.category || (i18n.t('common.other', 'Ostalo') as string);
      return {
        date: income.date,
        title: income.description || categoryLabel,
        metaParts: [categoryLabel, paymentInfo.name].filter(Boolean) as string[],
        amount: income.amount,
        signed: 'pos' as const,
      };
    });

  drawTransactionFeed(doc, feedItems, data.currency, 28, language === 'hr' ? 'hr-HR' : language === 'de' ? 'de-DE' : 'en-US');


  const period = `${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}`.replace(/\./g, '-');
  const fileName = buildReportFileName({ type: 'prihodi', owner, period, ext: 'pdf' });
  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: i18n.t('reportBranding.pageXofY'),
    intendedForLabel: fullBrand.confidentiality !== 'none' && owner
      ? `${i18n.t('reportBranding.intendedFor')}: ${owner}`
      : undefined,
  });
  await exportPDFDoc(doc, fileName, mode);
};

export const generateIncomeCSVReport = async (data: IncomeReportData, mode: ExportMode = 'save'): Promise<void> => {
  const headers = ['Datum', 'Opis', 'Kategorija', 'Iznos'];

  // CSV injection zaštita — vidi src/lib/csvSecurity.ts.
  const rows = data.incomeTransactions
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(income => {
      const safeDesc = sanitizeCsvField(income.description).replace(/"/g, '""');
      return [
        formatDate(income.date),
        `"${safeDesc}"`,
        sanitizeCsvField(income.category || 'Ostalo'),
        income.amount,
      ].join(',');
    });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const fileName = `prihodi_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.csv`;
  await exportTextFile(csvContent, fileName, 'text/csv', true, mode);
};

export const generateIncomeJSONExport = async (data: IncomeReportData, mode: ExportMode = 'save'): Promise<void> => {
  const exportData = {
    generatedAt: new Date().toISOString(),
    dateRange: {
      start: data.dateRange.start.toISOString(),
      end: data.dateRange.end.toISOString(),
    },
    totalIncome: data.totalIncome,
    byCategory: data.byCategory,
    transactions: data.incomeTransactions.map(e => ({
      ...e,
      date: e.date.toISOString(),
    })),
  };

  const fileName = `prihodi_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.json`;
  await exportTextFile(JSON.stringify(exportData, null, 2), fileName, 'application/json', false, mode);
};
