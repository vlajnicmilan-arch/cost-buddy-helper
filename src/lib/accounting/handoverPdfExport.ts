/**
 * B — PDF paketa za knjigovođu. Klijentski, kroz postojeći loader (`loadJsPdf`)
 * i `pdfReportKit` zaglavlje/podnožje. Bez novih biblioteka.
 */
import i18n from '@/i18n';
import { loadJsPdf } from '@/lib/loadJsPdf';
import { exportPDFDoc, type ExportMode } from '@/lib/fileExport';
import { applyBrandFont, brandAutoTable } from '@/lib/pdfBranding';
import { drawReportHeader, drawReportFooter, REPORT_MARGIN_X } from '@/lib/pdfReportKit';
import { ensureReportLogo } from '@/lib/reportLogo';
import { buildReportFileName, loadLastConfidentiality, type ReportBrandOptions } from '@/lib/reportDesign';
import { getReportOwner } from '@/hooks/useReportOwner';
import type { HandoverReportData, HandoverRowView } from './handoverReportTypes';

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('hr-HR', { style: 'currency', currency: currency || 'EUR' }).format(n);

const rowCells = (row: HandoverRowView, currency: string): string[] => [
  [row.supplier, row.oib].filter(Boolean).join('\n'),
  row.invoiceNumber,
  [row.issueDate, row.dueDate].filter(Boolean).join('\n'),
  money(row.base, currency),
  money(row.vat, currency),
  money(row.total, currency),
  row.paymentMethod,
  [row.categoryLabel, row.projectName, row.material ? i18n.t('eracun.accounting.materialExpense', 'materijalni trošak') : '']
    .filter(Boolean)
    .join('\n'),
];

export const exportAccountingHandoverPdf = async (
  data: HandoverReportData,
  mode: ExportMode = 'save',
): Promise<boolean> => {
  const { jsPDF, autoTable } = await loadJsPdf();
  await ensureReportLogo();
  const doc = new jsPDF({ orientation: 'landscape' });
  applyBrandFont(doc);

  const brand: ReportBrandOptions = {
    owner: await getReportOwner(),
    language: (i18n.language as any) || 'hr',
    confidentiality: loadLastConfidentiality(),
    subtitle: `${data.companyName} · ${data.periodLabel}`,
  };

  let y = drawReportHeader(doc, {
    title: i18n.t('eracun.handover.reportTitle', 'Predaja knjigovodstvu'),
    brand,
    confidentialityLabel: {
      internal: i18n.t('reportBranding.confidentiality.internal'),
      confidential: i18n.t('reportBranding.confidentiality.confidential'),
    },
  });

  const head = [[
    i18n.t('eracun.handover.colSupplier', 'Dobavljač / OIB'),
    i18n.t('eracun.handover.colNumber', 'Broj računa'),
    i18n.t('eracun.handover.colDate', 'Datum / dospijeće'),
    i18n.t('eracun.handover.colBase', 'Osnovica'),
    i18n.t('eracun.handover.colVat', 'PDV'),
    i18n.t('eracun.handover.colTotal', 'Ukupno'),
    i18n.t('eracun.handover.colPayment', 'Plaćanje'),
    i18n.t('eracun.handover.colCategory', 'Kategorija'),
  ]];

  for (const group of data.groups) {
    doc.setFontSize(10);
    doc.text(group.title, REPORT_MARGIN_X, y);
    y += 4;
    brandAutoTable(doc, autoTable, {
      startY: y,
      head,
      body: group.rows.map((r) => rowCells(r, data.currency)),
      margin: { left: REPORT_MARGIN_X, right: REPORT_MARGIN_X },
      foot: [[
        i18n.t('eracun.handover.groupTotal', 'Zbroj skupine'),
        '', '', '',
        money(group.vat, data.currency),
        money(group.total, data.currency),
        '', '',
      ]],
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  }

  brandAutoTable(doc, autoTable, {
    startY: y,
    head: [[
      i18n.t('eracun.handover.vatRate', 'Stopa PDV-a'),
      i18n.t('eracun.handover.colBase', 'Osnovica'),
      i18n.t('eracun.handover.colVat', 'PDV'),
      i18n.t('eracun.handover.colTotal', 'Ukupno'),
    ]],
    body: data.vatRecap.map((r) => [
      r.rate === null ? i18n.t('eracun.handover.vatUnclassified', 'nerazvrstano') : `${r.rate}%`,
      money(r.base, data.currency),
      money(r.vat, data.currency),
      money(r.total, data.currency),
    ]),
    foot: [[
      i18n.t('eracun.handover.totalLabel', 'Ukupno ({{count}} računa)', { count: data.totals.count }),
      money(data.totals.base, data.currency),
      money(data.totals.vat, data.currency),
      money(data.totals.total, data.currency),
    ]],
    margin: { left: REPORT_MARGIN_X, right: REPORT_MARGIN_X },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;

  if (data.missingDate.length > 0) {
    doc.setFontSize(10);
    doc.text(i18n.t('eracun.handover.missingDateTitle', 'Bez datuma — provjeri'), REPORT_MARGIN_X, y);
    y += 4;
    brandAutoTable(doc, autoTable, {
      startY: y,
      head,
      body: data.missingDate.map((r) => rowCells(r, data.currency)),
      margin: { left: REPORT_MARGIN_X, right: REPORT_MARGIN_X },
    });
  }

  drawReportFooter(doc, {
    brand,
    pageLabel: i18n.t('reportBranding.pageXofY'),
    intendedForLabel: brand.confidentiality !== 'none' && brand.owner
      ? `${i18n.t('reportBranding.intendedFor')}: ${brand.owner}`
      : undefined,
  });

  const fileName = buildReportFileName({
    type: `predaja-knjigovodstvu-${data.companyName}`,
    period: data.period,
    ext: 'pdf',
  });
  return exportPDFDoc(doc, fileName, mode);
};
