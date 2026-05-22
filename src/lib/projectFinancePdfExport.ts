// Fokusirani PDF izvoz za Earned Value i P&L kartice na projektu.
// Loader se dijeli s ostatkom aplikacije preko loadJsPdf.
import i18n from '@/i18n';
import { loadJsPdf } from '@/lib/loadJsPdf';
import { exportPDFDoc, type ExportMode } from '@/lib/fileExport';
import { applyBrandFont, brandAutoTable } from '@/lib/pdfBranding';
import { drawReportHeader, drawReportFooter, REPORT_MARGIN_X } from '@/lib/pdfReportKit';
import { ensureReportLogo } from '@/lib/reportLogo';
import { buildReportFileName, loadLastConfidentiality, type ReportBrandOptions } from '@/lib/reportDesign';
import { getReportOwner } from '@/hooks/useReportOwner';

export interface FinanceCurrency {
  code: string;
  locale: string;
}

const fmt = (n: number, c?: FinanceCurrency) =>
  new Intl.NumberFormat(c?.locale || 'hr-HR', {
    style: 'currency',
    currency: c?.code || 'EUR',
  }).format(n);

const resolveBrand = async (
  projectName: string,
  brand: ReportBrandOptions = {},
): Promise<ReportBrandOptions> => {
  const language = (brand.language || (i18n.language as any) || 'hr') as 'hr' | 'en' | 'de';
  const owner = brand.owner ?? (await getReportOwner());
  const confidentiality = brand.confidentiality ?? loadLastConfidentiality();
  const subtitle = brand.subtitle || `${i18n.t('projects.project', 'Projekt')}: ${projectName}`;
  return { owner, language, confidentiality, subtitle };
};

const drawFooter = (doc: any, fullBrand: ReportBrandOptions) => {
  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: i18n.t('reportBranding.pageXofY'),
    intendedForLabel: fullBrand.confidentiality !== 'none' && fullBrand.owner
      ? `${i18n.t('reportBranding.intendedFor')}: ${fullBrand.owner}`
      : undefined,
  });
};

const confidentialityLabel = () => ({
  internal: i18n.t('reportBranding.confidentiality.internal'),
  confidential: i18n.t('reportBranding.confidentiality.confidential'),
});

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
  mode: ExportMode = 'save',
  brand: ReportBrandOptions = {},
): Promise<boolean> => {
  const { jsPDF, autoTable } = await loadJsPdf();
  await ensureReportLogo();
  const doc = new jsPDF();
  applyBrandFont(doc);

  const fullBrand = await resolveBrand(data.projectName, brand);
  const bodyStartY = drawReportHeader(doc, {
    title: i18n.t('projects.earnedValue.title', 'Earned Value'),
    brand: fullBrand,
    confidentialityLabel: confidentialityLabel(),
  });

  let y = bodyStartY;
  doc.setFontSize(9.5);
  doc.setFont('Inter', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${i18n.t('common.status', 'Status')}: ${data.statusLabel}`, REPORT_MARGIN_X, y);
  y += 6;

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
    startY: y,
    head: [['Stavka', 'Vrijednost']],
    body: rows,
    margin: { left: REPORT_MARGIN_X },
    tableWidth: 170,
  });

  drawFooter(doc, fullBrand);
  const fileName = buildReportFileName({
    type: `earned-value-${data.projectName}`,
    owner: fullBrand.owner,
    ext: 'pdf',
  });
  return exportPDFDoc(doc, fileName, mode);
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
  mode: ExportMode = 'save',
  brand: ReportBrandOptions = {},
): Promise<boolean> => {
  const { jsPDF, autoTable } = await loadJsPdf();
  await ensureReportLogo();
  const doc = new jsPDF();
  applyBrandFont(doc);

  const fullBrand = await resolveBrand(data.projectName, brand);
  const bodyStartY = drawReportHeader(doc, {
    title: i18n.t('projects.profitLoss', 'Profitabilnost (P&L)'),
    brand: fullBrand,
    confidentialityLabel: confidentialityLabel(),
  });

  const totalCosts = data.laborCost + data.collaboratorCost + data.materialCost;
  const cashBalance = data.totalIncome - totalCosts;
  const hasContract = data.contractValue > 0;

  // Trenutno stanje (cash)
  doc.setFontSize(12);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Trenutno stanje (gotovina)', REPORT_MARGIN_X, bodyStartY);

  brandAutoTable(doc, autoTable, {
    startY: bodyStartY + 2,
    head: [['Stavka', 'Iznos']],
    body: [
      ['Naplaceno', fmt(data.totalIncome, data.currency)],
      ['Ukupni troskovi', fmt(totalCosts, data.currency)],
      ['Cash saldo', fmt(cashBalance, data.currency)],
      ['Neto profit', fmt(data.netProfit, data.currency)],
      ['Marza %', `${data.margin.toFixed(1)}%`],
    ],
    margin: { left: REPORT_MARGIN_X },
    tableWidth: 170,
  });

  if (hasContract) {
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('Inter', 'bold');
    doc.text('Ocekivano (ugovor)', REPORT_MARGIN_X, y);

    brandAutoTable(doc, autoTable, {
      startY: y + 2,
      head: [['Stavka', 'Iznos']],
      body: [
        ['Ugovoreno', fmt(data.contractValue, data.currency)],
        ['Svi troskovi', fmt(totalCosts, data.currency)],
        ['Ocekivani profit', fmt(data.expectedProfit, data.currency)],
        ['Ocekivana marza', `${data.expectedMargin.toFixed(1)}%`],
        ['Za naplatu', fmt(data.remainingToCollect, data.currency)],
      ],
      margin: { left: REPORT_MARGIN_X },
      tableWidth: 170,
    });
  }

  // Razrada troskova
  const yBreakdown = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont('Inter', 'bold');
  doc.text('Razrada troskova', REPORT_MARGIN_X, yBreakdown);

  brandAutoTable(doc, autoTable, {
    startY: yBreakdown + 2,
    head: [['Kategorija', 'Iznos']],
    body: [
      ['Radna snaga', fmt(data.laborCost, data.currency)],
      ['Suradnici', fmt(data.collaboratorCost, data.currency)],
      ['Materijalni troskovi', fmt(data.materialCost, data.currency)],
    ],
    margin: { left: REPORT_MARGIN_X },
    tableWidth: 170,
  });

  if (data.workers.length > 0) {
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('Inter', 'bold');
    doc.text('Radnici', REPORT_MARGIN_X, y);
    brandAutoTable(doc, autoTable, {
      startY: y + 2,
      head: [['Ime', 'Sati', 'Satnica', 'Trosak']],
      body: data.workers.map((w) => [
        w.name,
        `${w.hours.toFixed(1)}h`,
        `${fmt(w.rate, data.currency)}/h`,
        fmt(w.cost, data.currency),
      ]),
      margin: { left: REPORT_MARGIN_X },
    });
  }

  if (data.collaborators.length > 0) {
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('Inter', 'bold');
    doc.text('Suradnici', REPORT_MARGIN_X, y);
    brandAutoTable(doc, autoTable, {
      startY: y + 2,
      head: [['Ime', 'Ugovoreno', 'Placeno']],
      body: data.collaborators.map((c) => [
        c.name,
        fmt(c.totalPrice, data.currency),
        fmt(c.paidAmount, data.currency),
      ]),
      margin: { left: REPORT_MARGIN_X },
    });
  }

  drawFooter(doc, fullBrand);
  const fileName = buildReportFileName({
    type: `p-and-l-${data.projectName}`,
    owner: fullBrand.owner,
    ext: 'pdf',
  });
  return exportPDFDoc(doc, fileName, mode);
};
