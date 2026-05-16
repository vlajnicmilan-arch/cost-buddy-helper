// jspdf + jspdf-autotable are heavy (~420 KB). Load them on demand only when
// a PDF export is actually requested, so they stay out of the initial bundle.
import type { jsPDF as JsPDFType } from 'jspdf';
import { Expense, getCategoryInfo, getPaymentSourceInfo, getTransactionTypeInfo } from '@/types/expense';
import { exportPDFDoc, exportTextFile, type ExportMode } from '@/lib/fileExport';
import { addNotOfficialFooter } from '@/lib/pdfFooter';
import { sanitizeCsvField } from '@/lib/csvSecurity';
import { applyBrandFont, brandTableTheme, BRAND_TEAL, BRAND_TEAL_LIGHT, brandAutoTable } from '@/lib/pdfBranding';

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

export const generatePDFReport = async (data: ReportData, reportTitle: string = 'Financijsko izvjesce', mode: ExportMode = 'save'): Promise<void> => {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF();
  applyBrandFont(doc);
  
  doc.setFontSize(20);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii(reportTitle), 14, 20);
  
  doc.setFontSize(10);
  doc.setFont('Inter', 'normal');
  doc.text(`Razdoblje: ${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`, 14, 28);
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 34);

  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Sazetak'), 14, 46);

  const summaryData = [
    [toAscii('Ukupni prihodi'), formatCurrency(data.totals.income, data.currency)],
    [toAscii('Ukupni troskovi'), formatCurrency(data.totals.expenses, data.currency)],
    ['Stanje', formatCurrency(data.totals.balance, data.currency)],
    ['Prijenosi', formatCurrency(data.totals.transfers, data.currency)],
  ];

  brandAutoTable(doc, autoTable, {
    startY: 50,
    head: [['Stavka', 'Iznos']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [35, 170, 145] },
    margin: { left: 14 },
    tableWidth: 80,
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
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Popis transakcija', 14, 20);

  const transactionData = data.expenses
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(expense => {
      const typeInfo = getTransactionTypeInfo(expense.type);
      const categoryInfo = getCategoryInfo(expense.category);
      return [
        formatDate(expense.date),
        toAscii(typeInfo.name),
        toAscii(expense.description),
        toAscii(categoryInfo.name),
        expense.type === 'expense' 
          ? `-${formatCurrency(expense.amount, data.currency)}` 
          : formatCurrency(expense.amount, data.currency),
      ];
    });

  brandAutoTable(doc, autoTable, {
    startY: 24,
    head: [['Datum', 'Tip', 'Opis', 'Kategorija', 'Iznos']],
    body: transactionData,
    theme: 'striped',
    headStyles: { fillColor: [35, 170, 145] },
    margin: { left: 14 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 20 },
      2: { cellWidth: 60 },
      3: { cellWidth: 30 },
      4: { cellWidth: 30 },
    },
  });

  const fileName = `izvjestaj_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}`.replace(/\./g, '-') + '.pdf';
  addNotOfficialFooter(doc);
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

export const generateIncomePDFReport = async (data: IncomeReportData, reportTitle: string = 'Izvjesce o prihodima', mode: ExportMode = 'save'): Promise<void> => {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF();
  applyBrandFont(doc);
  
  doc.setFontSize(20);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii(reportTitle), 14, 20);
  
  doc.setFontSize(10);
  doc.setFont('Inter', 'normal');
  doc.text(`Razdoblje: ${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`, 14, 28);
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 34);

  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Sazetak prihoda'), 14, 46);

  const summaryData = [
    [toAscii('Ukupni prihodi'), formatCurrency(data.totalIncome, data.currency)],
    ['Broj transakcija', data.incomeTransactions.length.toString()],
  ];

  brandAutoTable(doc, autoTable, {
    startY: 50,
    head: [['Stavka', 'Vrijednost']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [35, 170, 145] },
    margin: { left: 14 },
    tableWidth: 80,
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
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Popis prihoda', 14, 20);

  const transactionData = data.incomeTransactions
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(income => {
      return [
        formatDate(income.date),
        toAscii(income.description),
        toAscii(income.category || 'Ostalo'),
        formatCurrency(income.amount, data.currency),
      ];
    });

  brandAutoTable(doc, autoTable, {
    startY: 24,
    head: [['Datum', 'Opis', 'Kategorija', 'Iznos']],
    body: transactionData,
    theme: 'striped',
    headStyles: { fillColor: [35, 170, 145] },
    margin: { left: 14 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 80 },
      2: { cellWidth: 40 },
      3: { cellWidth: 35 },
    },
  });

  const fileName = `prihodi_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}`.replace(/\./g, '-') + '.pdf';
  addNotOfficialFooter(doc);
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
