import { loadJsPdf } from './loadJsPdf';
import { exportFile } from './fileExport';
import { sanitizeCsvField } from './csvSecurity';

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

export async function generateWorkRecordsPDF(config: WorkExportConfig): Promise<void> {
  const { workers, entries, milestones, projectName, currency } = config;
  const { jsPDF } = await loadJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const msMap = new Map(milestones.map(m => [m.id, m.name]));
  const wMap = new Map(workers.map(w => [w.id, `${w.first_name} ${w.last_name}`.trim()]));

  let y = 15;
  doc.setFontSize(14);
  doc.text(`Radni sati — ${projectName}`, 15, y);
  y += 8;
  doc.setFontSize(9);
  doc.text(`Generirano: ${new Date().toLocaleString('hr-HR')}`, 15, y);
  y += 8;

  // Per-worker summary
  doc.setFontSize(11);
  doc.text('Sažetak po radniku', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.text('Radnik', 15, y);
  doc.text('Sati', 120, y, { align: 'right' });
  doc.text('Trošak', 190, y, { align: 'right' });
  y += 5;
  doc.line(15, y - 2, 195, y - 2);
  for (const w of workers) {
    if (y > 280) { doc.addPage(); y = 15; }
    doc.text(`${w.first_name} ${w.last_name}`.trim(), 15, y);
    doc.text(w.actualHoursTotal.toFixed(2), 120, y, { align: 'right' });
    doc.text(fmtCurrency(w.actualCostTotal, currency), 190, y, { align: 'right' });
    y += 5;
  }

  // Entries
  y += 6;
  if (y > 270) { doc.addPage(); y = 15; }
  doc.setFontSize(11);
  doc.text('Detaljni unosi', 15, y);
  y += 6;
  doc.setFontSize(8);
  doc.text('Radnik', 15, y);
  doc.text('Datum', 70, y);
  doc.text('h plan', 100, y, { align: 'right' });
  doc.text('h stvarno', 125, y, { align: 'right' });
  doc.text('Faze', 130, y);
  y += 4;
  doc.line(15, y - 2, 195, y - 2);

  const sorted = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date));
  for (const e of sorted) {
    if (y > 285) { doc.addPage(); y = 15; }
    const phases = (e.milestone_ids || []).map(id => msMap.get(id) || '').filter(Boolean).join(', ');
    doc.text((wMap.get(e.worker_id) || '').slice(0, 28), 15, y);
    doc.text(e.work_date, 70, y);
    doc.text(e.scheduled_hours.toFixed(2), 100, y, { align: 'right' });
    doc.text(e.actual_hours.toFixed(2), 125, y, { align: 'right' });
    doc.text(phases.slice(0, 40), 130, y);
    y += 4.5;
  }

  const blob = doc.output('blob');
  await exportFile(blob, `${safeFilename(projectName)}_radni_sati.pdf`, "save");
}
