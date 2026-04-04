import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Expense, getCategoryInfo, getPaymentSourceInfo, getTransactionTypeInfo } from '@/types/expense';


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
const toAscii = (text: string): string => {
  return text
    .replace(/č/g, 'c')
    .replace(/Č/g, 'C')
    .replace(/ć/g, 'c')
    .replace(/Ć/g, 'C')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/š/g, 's')
    .replace(/Š/g, 'S')
    .replace(/ž/g, 'z')
    .replace(/Ž/g, 'Z');
};

export const generatePDFReport = (data: ReportData, reportTitle: string = 'Financijsko izvjesce'): void => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(toAscii(reportTitle), 14, 20);
  
  // Date range
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Razdoblje: ${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`,
    14,
    28
  );
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 34);

  // Summary section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(toAscii('Sazetak'), 14, 46);

  const summaryStartY = 50;

  const summaryData = [
    [toAscii('Ukupni prihodi'), formatCurrency(data.totals.income, data.currency)],
    [toAscii('Ukupni troskovi'), formatCurrency(data.totals.expenses, data.currency)],
    ['Stanje', formatCurrency(data.totals.balance, data.currency)],
    ['Prijenosi', formatCurrency(data.totals.transfers, data.currency)],
  ];

  autoTable(doc, {
    startY: summaryStartY,
    head: [['Stavka', 'Iznos']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94] },
    margin: { left: 14 },
    tableWidth: 80,
  });

  // Category breakdown
  const categoryY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
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
    autoTable(doc, {
      startY: categoryY + 4,
      head: [['Kategorija', 'Iznos', 'Udio']],
      body: categoryData,
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] },
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  // Transaction list (new page)
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
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

  autoTable(doc, {
    startY: 24,
    head: [['Datum', 'Tip', 'Opis', 'Kategorija', 'Iznos']],
    body: transactionData,
    theme: 'striped',
    headStyles: { fillColor: [107, 114, 128] },
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

  // Save the PDF
  const fileName = `izvjestaj_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.pdf`.replace(/\./g, '-') + '.pdf';
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const generateCSVReport = (data: ReportData): void => {
  const headers = ['Datum', 'Tip', 'Opis', 'Kategorija', 'Način plaćanja', 'Iznos'];
  
  const rows = data.expenses
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(expense => {
      const typeInfo = getTransactionTypeInfo(expense.type);
      const categoryInfo = getCategoryInfo(expense.category);
      const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
      
      return [
        formatDate(expense.date),
        typeInfo.name,
        `"${expense.description.replace(/"/g, '""')}"`,
        categoryInfo.name,
        paymentInfo.name,
        expense.type === 'expense' ? -expense.amount : expense.amount,
      ].join(',');
    });

  const csvContent = [headers.join(','), ...rows].join('\n');
  
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `transakcije_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const generateJSONExport = (data: ReportData): void => {
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

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `financije_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};

// ============= INCOME REPORT EXPORTS =============

export interface IncomeReportData {
  incomeTransactions: Expense[];
  dateRange: { start: Date; end: Date };
  totalIncome: number;
  byCategory: Record<string, number>;
  currency?: CurrencyConfig;
}

export const generateIncomePDFReport = (data: IncomeReportData, reportTitle: string = 'Izvjesce o prihodima'): void => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(toAscii(reportTitle), 14, 20);
  
  // Date range
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Razdoblje: ${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`,
    14,
    28
  );
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 34);

  // Summary section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(toAscii('Sazetak prihoda'), 14, 46);

  const summaryData = [
    [toAscii('Ukupni prihodi'), formatCurrency(data.totalIncome, data.currency)],
    ['Broj transakcija', data.incomeTransactions.length.toString()],
  ];

  autoTable(doc, {
    startY: 50,
    head: [['Stavka', 'Vrijednost']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94] },
    margin: { left: 14 },
    tableWidth: 80,
  });

  // Category breakdown
  const categoryY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
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
    autoTable(doc, {
      startY: categoryY + 4,
      head: [['Kategorija', 'Iznos', 'Udio']],
      body: categoryData,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] },
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  // Transaction list (new page)
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
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

  autoTable(doc, {
    startY: 24,
    head: [['Datum', 'Opis', 'Kategorija', 'Iznos']],
    body: transactionData,
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94] },
    margin: { left: 14 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 80 },
      2: { cellWidth: 40 },
      3: { cellWidth: 35 },
    },
  });

  // Save the PDF
  const fileName = `prihodi_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.pdf`;
  doc.save(fileName.replace(/\./g, '-'));
};

export const generateIncomeCSVReport = (data: IncomeReportData): void => {
  const headers = ['Datum', 'Opis', 'Kategorija', 'Iznos'];
  
  const rows = data.incomeTransactions
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(income => {
      return [
        formatDate(income.date),
        `"${income.description.replace(/"/g, '""')}"`,
        income.category || 'Ostalo',
        income.amount,
      ].join(',');
    });

  const csvContent = [headers.join(','), ...rows].join('\n');
  
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `prihodi_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const generateIncomeJSONExport = (data: IncomeReportData): void => {
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

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `prihodi_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};
