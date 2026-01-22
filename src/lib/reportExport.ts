import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Expense, getCategoryInfo, getPaymentSourceInfo, getTransactionTypeInfo } from '@/types/expense';
import { IncomeSource } from '@/types/incomeSource';

export interface ReportData {
  expenses: Expense[];
  incomeSources: IncomeSource[];
  dateRange: { start: Date; end: Date };
  totals: {
    income: number;
    expenses: number;
    balance: number;
    transfers: number;
  };
  byCategory: Record<string, number>;
  byPaymentSource: Record<string, number>;
  byIncomeSource: Record<string, { income: number; expenses: number; balance: number }>;
  selectedIncomeSource?: { id: string; name: string; icon: string } | null;
}

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('hr-HR');
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('hr-HR', {
    style: 'currency',
    currency: 'EUR',
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

  // Show selected income source name if filtered
  let summaryStartY = 50;
  if (data.selectedIncomeSource) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(59, 130, 246); // Blue color
    const sourceName = data.selectedIncomeSource.id === 'unassigned' 
      ? 'Bez izvora' 
      : data.selectedIncomeSource.name;
    doc.text(`Izvor: ${toAscii(sourceName)}`, 14, 52);
    doc.setTextColor(0, 0, 0); // Reset to black
    summaryStartY = 58;
  }

  const summaryData = [
    [toAscii('Ukupni prihodi'), formatCurrency(data.totals.income)],
    [toAscii('Ukupni troskovi'), formatCurrency(data.totals.expenses)],
    ['Stanje', formatCurrency(data.totals.balance)],
    ['Prijenosi', formatCurrency(data.totals.transfers)],
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
      return [toAscii(info.name), formatCurrency(amount), `${percentage}%`];
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

  // Income sources breakdown (only show if not filtered by single source)
  const incomeSourceY = (doc as any).lastAutoTable?.finalY + 15 || categoryY + 20;
  
  if (Object.keys(data.byIncomeSource).length > 0 && !data.selectedIncomeSource) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Po izvorima prihoda', 14, incomeSourceY);

    const sourceData = Object.entries(data.byIncomeSource)
      .map(([sourceId, stats]) => {
        const source = data.incomeSources.find(s => s.id === sourceId);
        return [
          toAscii(source?.name || 'Nepoznato'),
          formatCurrency(stats.income),
          formatCurrency(stats.expenses),
          formatCurrency(stats.balance),
        ];
      });

    autoTable(doc, {
      startY: incomeSourceY + 4,
      head: [['Izvor', 'Prihodi', toAscii('Troskovi'), 'Stanje']],
      body: sourceData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14 },
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
          ? `-${formatCurrency(expense.amount)}` 
          : formatCurrency(expense.amount),
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
  const fileName = `izvjestaj_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.pdf`;
  doc.save(fileName.replace(/\./g, '-'));
};

export const generateCSVReport = (data: ReportData): void => {
  const headers = ['Datum', 'Tip', 'Opis', 'Kategorija', 'Način plaćanja', 'Iznos', 'Izvor prihoda'];
  
  const rows = data.expenses
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(expense => {
      const typeInfo = getTransactionTypeInfo(expense.type);
      const categoryInfo = getCategoryInfo(expense.category);
      const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
      const incomeSource = expense.income_source_id 
        ? data.incomeSources.find(s => s.id === expense.income_source_id)?.name || '' 
        : '';
      
      return [
        formatDate(expense.date),
        typeInfo.name,
        `"${expense.description.replace(/"/g, '""')}"`,
        categoryInfo.name,
        paymentInfo.name,
        expense.type === 'expense' ? -expense.amount : expense.amount,
        incomeSource,
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
    byIncomeSource: data.byIncomeSource,
    transactions: data.expenses.map(e => ({
      ...e,
      date: e.date.toISOString(),
    })),
    incomeSources: data.incomeSources,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `financije_${formatDate(data.dateRange.start)}_${formatDate(data.dateRange.end)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};
