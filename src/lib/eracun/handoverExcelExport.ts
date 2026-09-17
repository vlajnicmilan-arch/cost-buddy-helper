/**
 * B — Excel paketa za knjigovođu. Isti sadržaj kao PDF, dva lista:
 * „Računi" i „Rekapitulacija". Biblioteka se učitava lijeno, kao u
 * `src/lib/export/excelWorkbook.ts` — bez novih ovisnosti.
 */
import i18n from '@/i18n';
import { exportFile, type ExportMode } from '@/lib/fileExport';
import { buildReportFileName } from '@/lib/reportDesign';
import type { HandoverReportData, HandoverRowView } from './handoverReportTypes';

const HEADER = { fontWeight: 'bold' as const, backgroundColor: '#E2E8F0' };
const MONEY = '#,##0.00';

const headerRow = (labels: string[]) => labels.map((value) => ({ ...HEADER, type: String, value }));

const text = (value: string) => (value ? { type: String, value } : null);
const num = (value: number) => ({ type: Number, value, format: MONEY });

const invoiceRow = (row: HandoverRowView, groupTitle: string) => [
  text(groupTitle),
  text(row.supplier),
  text(row.oib),
  text(row.invoiceNumber),
  text(row.issueDate),
  text(row.dueDate),
  num(row.base),
  num(row.vat),
  num(row.total),
  text(row.paymentMethod),
  text(row.categoryLabel),
  text(row.projectName),
  { type: Boolean, value: row.material },
];

export const exportAccountingHandoverExcel = async (
  data: HandoverReportData,
  mode: ExportMode = 'save',
): Promise<boolean> => {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const invoicesHeader = headerRow([
    i18n.t('eracun.handover.colGroup', 'Skupina'),
    i18n.t('eracun.handover.colSupplierName', 'Dobavljač'),
    'OIB',
    i18n.t('eracun.handover.colNumber', 'Broj računa'),
    i18n.t('eracun.handover.colIssueDate', 'Datum računa'),
    i18n.t('eracun.handover.colDueDate', 'Dospijeće'),
    i18n.t('eracun.handover.colBase', 'Osnovica'),
    i18n.t('eracun.handover.colVat', 'PDV'),
    i18n.t('eracun.handover.colTotal', 'Ukupno'),
    i18n.t('eracun.handover.colPayment', 'Plaćanje'),
    i18n.t('eracun.handover.colCategory', 'Kategorija'),
    i18n.t('eracun.handover.colProject', 'Projekt'),
    i18n.t('eracun.accounting.materialExpense', 'materijalni trošak'),
  ]);

  const body: any[][] = [];
  for (const group of data.groups) {
    for (const row of group.rows) body.push(invoiceRow(row, group.title));
  }
  const missingTitle = i18n.t('eracun.handover.missingDateTitle', 'Bez datuma — provjeri');
  for (const row of data.missingDate) body.push(invoiceRow(row, missingTitle));

  const recapHeader = headerRow([
    i18n.t('eracun.handover.vatRate', 'Stopa PDV-a'),
    i18n.t('eracun.handover.colBase', 'Osnovica'),
    i18n.t('eracun.handover.colVat', 'PDV'),
    i18n.t('eracun.handover.colTotal', 'Ukupno'),
  ]);
  const recapBody: any[][] = data.vatRecap.map((r) => [
    text(r.rate === null ? i18n.t('eracun.handover.vatUnclassified', 'nerazvrstano') : `${r.rate}%`),
    num(r.base),
    num(r.vat),
    num(r.total),
  ]);
  recapBody.push([
    text(i18n.t('eracun.handover.totalLabel', 'Ukupno ({{count}} računa)', { count: data.totals.count })),
    num(data.totals.base),
    num(data.totals.vat),
    num(data.totals.total),
  ]);
  for (const group of data.groups) {
    recapBody.push([text(group.title), null, num(group.vat), num(group.total)]);
  }

  const sheets = [
    {
      sheet: i18n.t('eracun.handover.sheetInvoices', 'Računi'),
      data: [invoicesHeader, ...body],
      columns: [
        { width: 28 }, { width: 28 }, { width: 14 }, { width: 18 }, { width: 14 },
        { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 18 },
        { width: 20 }, { width: 22 }, { width: 18 },
      ],
      stickyRowsCount: 1,
    },
    {
      sheet: i18n.t('eracun.handover.sheetRecap', 'Rekapitulacija'),
      data: [recapHeader, ...recapBody],
      columns: [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }],
      stickyRowsCount: 1,
    },
  ];

  const blob = await (writeXlsxFile as any)(sheets).toBlob();
  const fileName = buildReportFileName({
    type: `predaja-knjigovodstvu-${data.companyName}`,
    period: data.period,
    ext: 'xlsx',
  });
  return exportFile(blob, fileName, mode);
};
