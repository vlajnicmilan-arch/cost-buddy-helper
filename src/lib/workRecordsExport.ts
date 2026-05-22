import i18n from '@/i18n';
import { loadJsPdf } from './loadJsPdf';
import { exportFile } from './fileExport';
import { sanitizeCsvField } from './csvSecurity';
import { applyBrandFont, brandTableTheme, BRAND_TEAL, BRAND_TEAL_LIGHT, brandAutoTable } from '@/lib/pdfBranding';
import { drawReportHeader, drawReportFooter, REPORT_MARGIN_X } from '@/lib/pdfReportKit';
import { ensureReportLogo } from '@/lib/reportLogo';
import { buildReportFileName, loadLastConfidentiality, type ReportBrandOptions } from '@/lib/reportDesign';
import { getReportOwner } from '@/hooks/useReportOwner';

export interface WorkExportConfig {
  workers: Array<{
    id: string;
    first_name: string;
    last_name: string;
    position?: string | null;
    hourly_rate?: number | null;
    work_start_time?: string | null;
    work_end_time?: string | null;
    actualHoursTotal: number;
    actualCostTotal: number;
  }>;
  entries: Array<{
    id: string;
    worker_id: string;
    work_date: string;
    scheduled_hours: number;
    actual_hours: number;
    note?: string | null;
    milestone_ids?: string[] | null;
  }>;
  milestones: Array<{ id: string; name: string }>;
  projectName: string;
  currency?: { code: string; symbol: string; locale: string };
}

const fmtCurrency = (n: number, c?: WorkExportConfig['currency']) => {
  if (!c) return n.toFixed(2);
  try {
    return new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.code }).format(n);
  } catch {
    return `${n.toFixed(2)} ${c.symbol}`;
  }
};

const safeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);

export async function generateWorkRecordsCSV(config: WorkExportConfig): Promise<void> {
  const { workers, entries, milestones, projectName, currency } = config;
  const msMap = new Map(milestones.map(m => [m.id, m.name]));
  const wMap = new Map(workers.map(w => [w.id, `${w.first_name} ${w.last_name}`.trim()]));

  // CSV injection zaštita: tekstualna polja prolaze kroz sanitizeCsvField
  // (prefixira razmakom ako počinju s =, +, -, @). Vidi src/lib/csvSecurity.ts.
  const lines: string[] = [];
  lines.push(`Projekt;${sanitizeCsvField(projectName)}`);
  lines.push('');
  lines.push('Radnik;Datum;Planirano (h);Stvarno (h);Faze;Napomena');

  const sorted = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date));
  for (const e of sorted) {
    const phases = (e.milestone_ids || []).map(id => msMap.get(id) || '').filter(Boolean).join(', ');
    const note = (e.note || '').replace(/[\r\n;]+/g, ' ').trim();
    lines.push([
      sanitizeCsvField(wMap.get(e.worker_id) || e.worker_id),
      e.work_date,
      e.scheduled_hours.toString(),
      e.actual_hours.toString(),
      sanitizeCsvField(phases),
      sanitizeCsvField(note),
    ].join(';'));
  }

  lines.push('');
  lines.push('Sažetak po radniku;Sati;Trošak');
  for (const w of workers) {
    lines.push([
      sanitizeCsvField(`${w.first_name} ${w.last_name}`.trim()),
      w.actualHoursTotal.toFixed(2),
      currency ? fmtCurrency(w.actualCostTotal, currency) : w.actualCostTotal.toFixed(2),
    ].join(';'));
  }

  const csv = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  await exportFile(blob, `${safeFilename(projectName)}_radni_sati.csv`, "save");
}

export async function generateWorkRecordsJSON(config: WorkExportConfig): Promise<void> {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  await exportFile(blob, `${safeFilename(config.projectName)}_radni_sati.json`, "save");
}

export async function generateWorkRecordsPDF(
  config: WorkExportConfig,
  brand: ReportBrandOptions = {},
): Promise<void> {
  const { workers, entries, milestones, projectName, currency } = config;
  const { jsPDF, autoTable } = await loadJsPdf();
  await ensureReportLogo();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  applyBrandFont(doc);

  const language = (brand.language || (i18n.language as any) || 'hr') as 'hr' | 'en' | 'de';
  const owner = brand.owner ?? (await getReportOwner());
  const confidentiality = brand.confidentiality ?? loadLastConfidentiality();
  const subtitle = brand.subtitle || `${i18n.t('projects.project', 'Projekt')}: ${projectName}`;
  const fullBrand: ReportBrandOptions = { owner, language, confidentiality, subtitle };

  const bodyStartY = drawReportHeader(doc, {
    title: i18n.t('workers.title', 'Radni sati'),
    brand: fullBrand,
    confidentialityLabel: {
      internal: i18n.t('reportBranding.confidentiality.internal'),
      confidential: i18n.t('reportBranding.confidentiality.confidential'),
    },
  });

  const msMap = new Map(milestones.map(m => [m.id, m.name]));
  const wMap = new Map(workers.map(w => [w.id, `${w.first_name} ${w.last_name}`.trim()]));

  doc.setFontSize(12);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Sažetak po radniku', REPORT_MARGIN_X, bodyStartY);

  brandAutoTable(doc, autoTable, {
    startY: bodyStartY + 2,
    head: [['Radnik', 'Sati', 'Trošak']],
    body: workers.map(w => [
      `${w.first_name} ${w.last_name}`.trim(),
      w.actualHoursTotal.toFixed(2),
      fmtCurrency(w.actualCostTotal, currency),
    ]),
    margin: { left: REPORT_MARGIN_X },
    tableWidth: 170,
  });

  const detailY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont('Inter', 'bold');
  doc.text('Detaljni unosi', REPORT_MARGIN_X, detailY);

  const sorted = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date));
  brandAutoTable(doc, autoTable, {
    startY: detailY + 2,
    head: [['Radnik', 'Datum', 'h plan', 'h stvarno', 'Faze']],
    body: sorted.map(e => {
      const phases = (e.milestone_ids || []).map(id => msMap.get(id) || '').filter(Boolean).join(', ');
      return [
        wMap.get(e.worker_id) || '',
        e.work_date,
        e.scheduled_hours.toFixed(2),
        e.actual_hours.toFixed(2),
        phases,
      ];
    }),
    styles: { fontSize: 8 },
    margin: { left: REPORT_MARGIN_X },
  });

  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: i18n.t('reportBranding.pageXofY'),
    intendedForLabel: fullBrand.confidentiality !== 'none' && owner
      ? `${i18n.t('reportBranding.intendedFor')}: ${owner}`
      : undefined,
  });

  const blob = doc.output('blob');
  const fileName = buildReportFileName({ type: `radni-sati-${projectName}`, owner, ext: 'pdf' });
  await exportFile(blob, fileName, 'save');
}
