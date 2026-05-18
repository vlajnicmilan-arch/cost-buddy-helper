// Fokusirani PDF izvoz za Earned Value i P&L kartice na projektu.
// Loader se dijeli s ostatkom aplikacije preko loadJsPdf.
import { loadJsPdf } from '@/lib/loadJsPdf';
import { exportPDFDoc, type ExportMode } from '@/lib/fileExport';
import { addNotOfficialFooter } from '@/lib/pdfFooter';
import { applyBrandFont, brandAutoTable } from '@/lib/pdfBranding';

export interface FinanceCurrency {
  code: string;
  locale: string;
}

const fmt = (n: number, c?: FinanceCurrency) =>
  new Intl.NumberFormat(c?.locale || 'hr-HR', {
    style: 'currency',
    currency: c?.code || 'EUR',
  }).format(n);

const today = () => new Date().toLocaleDateString('hr-HR');

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'projekt';

export interface EarnedValueExportData {
  projectName: string;
  currency?: FinanceCurrency;
  contractValue: number;
  spent: number;
  marginAmount: number;
  marginPct: number;
  eac: number;
  healthScore: number;
  healthLevel: string;
  statusLabel: string;
}

export const exportEarnedValuePdf = async (
  data: EarnedValueExportData,
  mode: ExportMode = 'save'
): Promise<boolean> => {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF();
  applyBrandFont(doc);

  doc.setFontSize(18);
  doc.setFont('Inter', 'bold');
  doc.text('Earned Value', 14, 20);

  doc.setFontSize(11);
  doc.setFont('Inter', 'normal');
  doc.text(`Projekt: ${data.projectName}`, 14, 28);
  doc.text(`Generirano: ${today()}`, 14, 34);
  doc.text(`Status: ${data.statusLabel}`, 14, 40);

  const rows = [
    ['Ugovoreno', fmt(data.contractValue, data.currency)],
    ['Trosak', fmt(data.spent, data.currency)],
    [
      'Marza',
      `${data.marginAmount >= 0 ? '+' : ''}${fmt(data.marginAmount, data.currency)}`,
    ],
    ['Marza %', `${data.marginPct.toFixed(1)}%`],
    ['Predvideni finalni trosak (EAC)', fmt(data.eac, data.currency)],
    ['Zdravlje projekta', `${data.healthScore}/100 (${data.healthLevel})`],
  ];

  brandAutoTable(doc, autoTable, {
    startY: 48,
    head: [['Stavka', 'Vrijednost']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [35, 170, 145] },
    margin: { left: 14 },
    tableWidth: 170,
  });

  addNotOfficialFooter(doc);
  return exportPDFDoc(doc, `earned-value-${slug(data.projectName)}.pdf`, mode);
};

export interface ProfitLossExportData {
  projectName: string;
  currency?: FinanceCurrency;
  totalIncome: number;
  totalExpenses: number;
  laborCost: number;
  collaboratorCost: number;
  materialCost: number;
  netProfit: number;
  margin: number;
  contractValue: number;
  expectedProfit: number;
  expectedMargin: number;
  remainingToCollect: number;
  workers: { name: string; hours: number; rate: number; cost: number }[];
  collaborators: { name: string; totalPrice: number; paidAmount: number }[];
}

export const exportProfitLossPdf = async (
  data: ProfitLossExportData,
  mode: ExportMode = 'save'
): Promise<boolean> => {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF();
  applyBrandFont(doc);

  doc.setFontSize(18);
  doc.setFont('Inter', 'bold');
  doc.text('Profitabilnost (P&L)', 14, 20);

  doc.setFontSize(11);
  doc.setFont('Inter', 'normal');
  doc.text(`Projekt: ${data.projectName}`, 14, 28);
  doc.text(`Generirano: ${today()}`, 14, 34);

  const totalCosts = data.laborCost + data.collaboratorCost + data.materialCost;
  const cashBalance = data.totalIncome - totalCosts;
  const hasContract = data.contractValue > 0;

  // Trenutno stanje (cash)
  doc.setFontSize(13);
  doc.setFont('Inter', 'bold');
  doc.text('Trenutno stanje (gotovina)', 14, 46);

  brandAutoTable(doc, autoTable, {
    startY: 50,
    head: [['Stavka', 'Iznos']],
    body: [
      ['Naplaceno', fmt(data.totalIncome, data.currency)],
      ['Ukupni troskovi', fmt(totalCosts, data.currency)],
      ['Cash saldo', fmt(cashBalance, data.currency)],
      ['Neto profit', fmt(data.netProfit, data.currency)],
      ['Marza %', `${data.margin.toFixed(1)}%`],
    ],
    theme: 'striped',
    headStyles: { fillColor: [35, 170, 145] },
    margin: { left: 14 },
    tableWidth: 170,
  });

  if (hasContract) {
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('Inter', 'bold');
    doc.text('Ocekivano (ugovor)', 14, y);

    brandAutoTable(doc, autoTable, {
      startY: y + 4,
      head: [['Stavka', 'Iznos']],
      body: [
        ['Ugovoreno', fmt(data.contractValue, data.currency)],
        ['Svi troskovi', fmt(totalCosts, data.currency)],
        ['Ocekivani profit', fmt(data.expectedProfit, data.currency)],
        ['Ocekivana marza', `${data.expectedMargin.toFixed(1)}%`],
        ['Za naplatu', fmt(data.remainingToCollect, data.currency)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
      tableWidth: 170,
    });
  }

  // Razrada troskova
  const yBreakdown = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(13);
  doc.setFont('Inter', 'bold');
  doc.text('Razrada troskova', 14, yBreakdown);

  brandAutoTable(doc, autoTable, {
    startY: yBreakdown + 4,
    head: [['Kategorija', 'Iznos']],
    body: [
      ['Radna snaga', fmt(data.laborCost, data.currency)],
      ['Suradnici', fmt(data.collaboratorCost, data.currency)],
      ['Materijalni troskovi', fmt(data.materialCost, data.currency)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [35, 170, 145] },
    margin: { left: 14 },
    tableWidth: 170,
  });

  if (data.workers.length > 0) {
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('Inter', 'bold');
    doc.text('Radnici', 14, y);
    brandAutoTable(doc, autoTable, {
      startY: y + 4,
      head: [['Ime', 'Sati', 'Satnica', 'Trosak']],
      body: data.workers.map((w) => [
        w.name,
        `${w.hours.toFixed(1)}h`,
        `${fmt(w.rate, data.currency)}/h`,
        fmt(w.cost, data.currency),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
    });
  }

  if (data.collaborators.length > 0) {
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('Inter', 'bold');
    doc.text('Suradnici', 14, y);
    brandAutoTable(doc, autoTable, {
      startY: y + 4,
      head: [['Ime', 'Ugovoreno', 'Placeno']],
      body: data.collaborators.map((c) => [
        c.name,
        fmt(c.totalPrice, data.currency),
        fmt(c.paidAmount, data.currency),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
    });
  }

  addNotOfficialFooter(doc);
  return exportPDFDoc(doc, `p-and-l-${slug(data.projectName)}.pdf`, mode);
};
