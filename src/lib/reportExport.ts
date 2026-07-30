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
import {
  aggregateCategoryTotalsByName,
  formatPercent,
  isCorrectionTx,
  topCategoriesWithRest,
  cleanFeedTitle,
  buildFeedSubtitle,
  buildExecutiveSummary,
  findLargestExpense,
  aggregateMerchants,

  type CategoryRow,
} from '@/lib/reportTotals';

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
  /** Raw bank description shown dimmed under the title when it differs. */
  rawDescription?: string;
  metaParts: string[];
  amount: number;
  signed: 'pos' | 'neg' | 'neutral';
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLabel = (d: Date, locale: string) =>
  d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });


const drawTransactionFeed = (
  doc: JsPDFType,
  items: FeedItem[],
  currency: CurrencyConfig | undefined,
  startY: number,
  locale: string,
  owner?: string | null,
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

  const fit = (text: string, maxWidth: number): string => {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    const r = maxWidth / Math.max(doc.getTextWidth(text), 1);
    return text.substring(0, Math.max(1, Math.floor(text.length * r) - 1)) + '…';
  };

  for (const key of sortedKeys) {
    const dayItems = grouped.get(key)!;
    ensureSpace(9);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(toAscii(dayLabel(dayItems[0].date, locale)), leftX, y);
    y += 2.6;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.line(leftX, y, rightX, y);
    y += 3.4;

    for (let i = 0; i < dayItems.length; i++) {
      const it = dayItems[i];
      const cleanTitle = cleanFeedTitle(it.title) || '—';
      const rawLine = buildFeedSubtitle(it.rawDescription, cleanTitle);
      const metaText = it.metaParts.filter(Boolean).join(' · ');
      const rowHeight = 3.2 + (rawLine ? 3.1 : 0) + (metaText ? 3.3 : 0);
      ensureSpace(rowHeight + 3);

      const amountText = (it.signed === 'neg' ? '-' : it.signed === 'pos' ? '+' : '') +
        formatCurrency(Math.abs(it.amount), currency);

      doc.setFont('Inter', 'bold');
      doc.setFontSize(9);
      if (it.signed === 'neg') doc.setTextColor(220, 38, 38);
      else if (it.signed === 'pos') doc.setTextColor(22, 163, 74);
      else doc.setTextColor(15, 23, 42);
      const amountWidth = doc.getTextWidth(amountText);
      doc.text(amountText, rightX - amountWidth, y);

      doc.setFont('Inter', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(fit(toAscii(cleanTitle), rightX - leftX - amountWidth - 6), leftX, y);

      let lineY = y;
      if (rawLine) {
        lineY += 3.1;
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(fit(toAscii(rawLine), rightX - leftX), leftX, lineY);
      }
      if (metaText) {
        lineY += 3.3;
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(fit(toAscii(metaText), rightX - leftX), leftX, lineY);
      }

      y += rowHeight;
      if (i < dayItems.length - 1) {
        doc.setDrawColor(240, 244, 248);
        doc.setLineWidth(0.1);
        doc.line(leftX, y, rightX, y);
      }
      y += 2.6;
    }

    y += 2.4;
  }
};

// ===== Page 1 dashboard =====

const KPI_GAP = 4;

const drawKpiCards = (
  doc: JsPDFType,
  y: number,
  cards: { label: string; value: string; tone: 'income' | 'expense' | 'neutral' | 'accent' }[],
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const totalW = pageWidth - REPORT_MARGIN_X * 2;
  const n = Math.max(cards.length, 1);
  const cardW = (totalW - KPI_GAP * (n - 1)) / n;
  const cardH = 20;

  cards.forEach((c, i) => {
    const x = REPORT_MARGIN_X + i * (cardW + KPI_GAP);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    const accent: [number, number, number] =
      c.tone === 'income' ? [22, 163, 74]
      : c.tone === 'expense' ? [220, 38, 38]
      : c.tone === 'accent' ? [35, 170, 145]
      : [71, 85, 105];
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.roundedRect(x, y, 1.6, cardH, 0.8, 0.8, 'F');

    doc.setFont('Inter', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(toAscii(c.label).toUpperCase(), x + 4, y + 6.5);

    doc.setFont('Inter', 'bold');
    doc.setTextColor(accent[0], accent[1], accent[2]);
    let size = 13;
    doc.setFontSize(size);
    while (size > 7 && doc.getTextWidth(c.value) > cardW - 8) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    doc.text(c.value, x + 4, y + 15);
  });

  doc.setTextColor(0, 0, 0);
  return y + cardH;
};

const CATEGORY_BAR_COLORS: [number, number, number][] = [
  [23, 138, 118],
  [35, 170, 145],
  [72, 190, 168],
  [122, 208, 192],
  [168, 224, 213],
  [203, 213, 225],
];

const drawCategoryBars = (
  doc: JsPDFType,
  y: number,
  rows: CategoryRow[],
  totalExpenses: number,
  currency: CurrencyConfig | undefined,
  numberLocale: string,
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const leftX = REPORT_MARGIN_X;
  const rightX = pageWidth - REPORT_MARGIN_X;
  const trackW = rightX - leftX;
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0);

  let cursor = y;
  rows.forEach((r, i) => {
    const color = CATEGORY_BAR_COLORS[Math.min(i, CATEGORY_BAR_COLORS.length - 1)];
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(toAscii(r.name), leftX, cursor);

    const valueText = `${formatCurrency(r.amount, currency)}  ·  ${formatPercent(r.amount, totalExpenses, numberLocale)}`;
    doc.setTextColor(100, 116, 139);
    doc.text(valueText, rightX - doc.getTextWidth(valueText), cursor);

    cursor += 1.8;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(leftX, cursor, trackW, 3, 1.5, 1.5, 'F');
    const w = max > 0 ? Math.max((r.amount / max) * trackW, 1.5) : 1.5;
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(leftX, cursor, w, 3, 1.5, 1.5, 'F');
    cursor += 7;
  });

  doc.setTextColor(0, 0, 0);
  return cursor;
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

  const numberLocale = data.currency?.locale || 'hr-HR';
  const dateLocale = language === 'hr' ? 'hr-HR' : language === 'de' ? 'de-DE' : 'en-US';

  // --- KPI strip (compact) ---
  let y = drawKpiCards(doc, bodyStartY - 3, [
    { label: i18n.t('reports.income', 'Prihodi') as string, value: formatCurrency(data.totals.income, data.currency), tone: 'income' },
    { label: i18n.t('reports.expenses', 'Troškovi') as string, value: formatCurrency(data.totals.expenses, data.currency), tone: 'expense' },
    { label: i18n.t('reports.netForPeriod', 'Neto razdoblja') as string, value: formatCurrency(data.totals.balance, data.currency), tone: data.totals.balance >= 0 ? 'income' : 'expense' },
    { label: i18n.t('reports.kpiTransactions', 'Transakcije') as string, value: String(data.expenses.length), tone: 'accent' },
  ]);

  // --- Transfers, discrete line ---
  y += 4;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${toAscii(i18n.t('reports.transfersLabel', 'Prijenosi') as string)}: ${formatCurrency(data.totals.transfers, data.currency)}`,
    REPORT_MARGIN_X,
    y,
  );

  // --- Executive summary (deterministic) ---
  const allCategoryRows = aggregateCategoryTotalsByName(
    data.byCategory,
    (categoryId) => getCategoryInfo(categoryId as any).name,
  );
  const largest = findLargestExpense(
    data.expenses.map((e) => ({
      type: e.type,
      amount: e.amount,
      category: e.category,
      expense_nature: (e as any).expense_nature ?? null,
      description: e.description,
      date: e.date,
    })),
  );

  // Merchants inside the biggest expense category (post-extraction).
  const topCategoryName = allCategoryRows[0]?.name;
  const topCategoryMerchants = topCategoryName
    ? aggregateMerchants(
        data.expenses
          .filter(
            (e) =>
              e.type === 'expense' &&
              !isCorrectionTx(e as any) &&
              getCategoryInfo(e.category as any).name === topCategoryName,
          )
          .map((e) => ({
            title: cleanFeedTitle(e.description, owner),
            amount: e.amount,
          })),
      ).filter((m) => m.name.toLowerCase() !== topCategoryName.toLowerCase())
    : [];

  const summarySentences = buildExecutiveSummary(
    {
      start: data.dateRange.start,
      end: data.dateRange.end,
      count: data.expenses.length,
      income: data.totals.income,
      expenses: data.totals.expenses,
      net: data.totals.balance,
      categories: allCategoryRows,
      topCategoryMerchants,
      largestExpense: largest
        ? {
            title: cleanFeedTitle(largest.description, owner) || getCategoryInfo(largest.category as any).name,
            amount: largest.amount,
            date: largest.date as Date,
          }
        : null,
    },
    {
      currency: (n) => formatCurrency(n, data.currency),
      date: (d) => formatDate(d),
      percent: (v, total) => formatPercent(v, total, numberLocale),
    },
    {
      main: i18n.t('reports.summaryMain') as string,
      categoriesTwo: i18n.t('reports.summaryCategoriesTwo') as string,
      categoriesOne: i18n.t('reports.summaryCategoriesOne') as string,
      largest: i18n.t('reports.summaryLargest') as string,
      merchantsTwo: i18n.t('reports.summaryMerchantsTwo') as string,
      merchantsOne: i18n.t('reports.summaryMerchantsOne') as string,
      empty: i18n.t('reports.summaryEmpty') as string,
    },
  );

  y += 7;
  doc.setFont('Inter', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(toAscii(i18n.t('reports.summaryTitle', 'Sažetak razdoblja') as string), REPORT_MARGIN_X, y);
  y += 4.5;

  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = pageWidth - REPORT_MARGIN_X * 2;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const summaryLines = doc.splitTextToSize(toAscii(summarySentences.join(' ')), textWidth) as string[];
  doc.text(summaryLines, REPORT_MARGIN_X, y);
  y += summaryLines.length * 4.1;

  // --- Category bars (top 5 + rest) ---
  if (allCategoryRows.length > 0) {
    y += 5;
    doc.setFont('Inter', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(toAscii(i18n.t('reports.topCategories', 'Glavne kategorije') as string), REPORT_MARGIN_X, y);
    y += 5;
    y = drawCategoryBars(
      doc,
      y,
      topCategoriesWithRest(allCategoryRows, 5, i18n.t('reports.otherCategories', 'Ostale kategorije') as string),
      data.totals.expenses,
      data.currency,
      numberLocale,
    );
  }

  // --- Transactions continue right below, no forced page break ---
  y += 5;
  doc.setFontSize(11);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(toAscii(i18n.t('reports.transactionList', 'Popis transakcija') as string), REPORT_MARGIN_X, y);
  y += 6;

  if (data.expenses.length === 0) {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(toAscii(i18n.t('reports.noTransactionsInPeriod', 'Nema transakcija u odabranom razdoblju') as string), REPORT_MARGIN_X, y);
  }

  const feedItems: FeedItem[] = data.expenses
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(expense => {
      const typeInfo = getTransactionTypeInfo(expense.type);
      const categoryInfo = getCategoryInfo(expense.category);
      const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
      const isCorrection = isCorrectionTx(expense as any);
      const signed: 'pos' | 'neg' | 'neutral' = isCorrection
        ? 'neutral'
        : expense.type === 'expense' ? 'neg' : expense.type === 'income' ? 'pos' : 'neutral';
      const otherLabel = (i18n.t('common.other', 'Ostalo') as string).toLowerCase();
      const categoryLabel = categoryInfo.name && categoryInfo.name.toLowerCase() !== otherLabel
        ? categoryInfo.name
        : '';
      const meta: string[] = [categoryLabel, paymentInfo.name];
      if (isCorrection) meta.push(i18n.t('reports.correctionLabel', 'Korekcija') as string);
      else if (expense.type !== 'expense') meta.push(typeInfo.name);
      return {
        date: expense.date,
        title: expense.description || categoryInfo.name,
        rawDescription: expense.description || '',
        metaParts: meta.filter(Boolean) as string[],
        amount: expense.amount,
        signed,
      };
    });


  drawTransactionFeed(doc, feedItems, data.currency, y, dateLocale, owner);


  const period = `${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}`.replace(/\./g, '-');
  const fileName = buildReportFileName({ type: 'izvjestaj', owner, period, ext: 'pdf' });
  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: i18n.t('reportBranding.pageXofY'),
    generatedLabel: i18n.t('reports.generatedIn', {
      date: new Date().toLocaleDateString(dateLocale),
      defaultValue: 'Generirano u Centru · {{date}}',
    }) as string,
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
      return [
        toAscii(categoryId),
        formatCurrency(amount, data.currency),
        formatPercent(amount, data.totalIncome, data.currency?.locale || 'hr-HR'),
      ];
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
        rawDescription: income.description || '',
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
