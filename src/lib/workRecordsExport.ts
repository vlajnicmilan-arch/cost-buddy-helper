import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportPDFDoc, exportTextFile } from '@/lib/fileExport';

export interface WorkerExportData {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  hourly_rate: number;
  work_start_time?: string;
  work_end_time?: string;
  actualHoursTotal: number;
  actualCostTotal: number;
}

export interface WorkEntryExportData {
  id: string;
  worker_id: string;
  work_date: string;
  scheduled_hours: number;
  actual_hours: number;
  note?: string | null;
  milestone_ids?: string[] | null;
}

export interface WorkExportConfig {
  workers: WorkerExportData[];
  entries: WorkEntryExportData[];
  milestones: { id: string; name: string }[];
  projectName: string;
  currency?: { code: string; symbol: string; locale: string };
}

const formatDate = (date: Date): string => date.toLocaleDateString('hr-HR');

const formatCurrency = (amount: number, currency?: { code: string; locale: string }): string => {
  return new Intl.NumberFormat(currency?.locale || 'hr-HR', {
    style: 'currency',
    currency: currency?.code || 'EUR',
  }).format(amount);
};

const toAscii = (text: string): string => {
  return text
    .replace(/č/g, 'c').replace(/Č/g, 'C')
    .replace(/ć/g, 'c').replace(/Ć/g, 'C')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/š/g, 's').replace(/Š/g, 'S')
    .replace(/ž/g, 'z').replace(/Ž/g, 'Z');
};

const getWorkerName = (workerId: string, workers: WorkerExportData[]) => {
  const w = workers.find(w => w.id === workerId);
  return w ? `${w.first_name} ${w.last_name}` : 'Nepoznato';
};

const getMilestoneNames = (ids: string[] | null | undefined, milestones: { id: string; name: string }[]) => {
  if (!ids || ids.length === 0) return '-';
  return ids.map(id => milestones.find(m => m.id === id)?.name || '?').join(', ');
};

// ============= PDF =============

export const generateWorkRecordsPDF = async (data: WorkExportConfig): Promise<void> => {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(toAscii(`Evidencija rada - ${data.projectName}`), 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 28);

  // Summary
  const totalHours = data.entries.reduce((s, e) => s + e.actual_hours, 0);
  const scheduledHours = data.entries.reduce((s, e) => s + e.scheduled_hours, 0);
  const totalCost = data.workers.reduce((s, w) => s + w.actualCostTotal, 0);
  const workDays = new Set(data.entries.map(e => e.work_date)).size;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(toAscii('Sazetak'), 14, 40);

  autoTable(doc, {
    startY: 44,
    head: [['Stavka', 'Vrijednost']],
    body: [
      ['Broj radnika', data.workers.length.toString()],
      ['Radnih dana', workDays.toString()],
      ['Planirano sati', `${scheduledHours}h`],
      [toAscii('Odradjeno sati'), `${totalHours}h`],
      [toAscii('Ukupni trosak'), formatCurrency(totalCost, data.currency)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] },
    margin: { left: 14 },
    tableWidth: 100,
  });

  // Per-worker summary
  const workerY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(toAscii('Pregled po djelatnicima'), 14, workerY);

  const workerRows = data.workers.map(w => [
    toAscii(`${w.first_name} ${w.last_name}`),
    toAscii(w.position),
    formatCurrency(w.hourly_rate, data.currency) + '/h',
    `${w.actualHoursTotal}h`,
    formatCurrency(w.actualCostTotal, data.currency),
  ]);

  autoTable(doc, {
    startY: workerY + 4,
    head: [['Ime', 'Pozicija', 'Satnica', 'Sati', toAscii('Trosak')]],
    body: workerRows,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14 },
  });

  // Per-milestone summary
  if (data.milestones.length > 0) {
    const msY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Pregled po fazama', 14, msY);

    const msRows = data.milestones.map(m => {
      const msEntries = data.entries.filter(e => e.milestone_ids?.includes(m.id));
      const hours = msEntries.reduce((s, e) => s + e.actual_hours, 0);
      const cost = msEntries.reduce((s, e) => {
        const w = data.workers.find(w => w.id === e.worker_id);
        return s + (w ? e.actual_hours * w.hourly_rate : 0);
      }, 0);
      return [toAscii(m.name), `${hours}h`, formatCurrency(cost, data.currency)];
    });

    autoTable(doc, {
      startY: msY + 4,
      head: [['Faza', 'Sati', toAscii('Trosak')]],
      body: msRows,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] },
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  // Detailed entries (new page)
  if (data.entries.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Popis svih radnih dana', 14, 20);

    const entryRows = [...data.entries]
      .sort((a, b) => a.work_date.localeCompare(b.work_date))
      .map(e => {
        const w = data.workers.find(w => w.id === e.worker_id);
        const cost = w ? e.actual_hours * w.hourly_rate : 0;
        return [
          e.work_date.split('-').reverse().join('.'),
          toAscii(getWorkerName(e.worker_id, data.workers)),
          `${e.scheduled_hours}h`,
          `${e.actual_hours}h`,
          formatCurrency(cost, data.currency),
          toAscii(getMilestoneNames(e.milestone_ids, data.milestones)),
          toAscii(e.note || '-'),
        ];
      });

    autoTable(doc, {
      startY: 24,
      head: [['Datum', 'Djelatnik', 'Plan', toAscii('Odradj.'), toAscii('Trosak'), 'Faze', 'Napomena']],
      body: entryRows,
      theme: 'striped',
      headStyles: { fillColor: [107, 114, 128] },
      margin: { left: 14 },
      styles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 30 },
        2: { cellWidth: 15 },
        3: { cellWidth: 15 },
        4: { cellWidth: 25 },
        5: { cellWidth: 40 },
        6: { cellWidth: 35 },
      },
    });
  }

  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `evidencija_${safeName}_${formatDate(new Date()).replace(/\./g, '-')}.pdf`;
  await exportPDFDoc(doc, fileName);
};

// ============= CSV =============

export const generateWorkRecordsCSV = (data: WorkExportConfig): void => {
  const rows: string[] = [];

  // Workers summary
  rows.push('"--- DJELATNICI ---"');
  rows.push('"Ime","Prezime","Pozicija","Satnica","Odrađeno sati","Ukupni trošak"');
  data.workers.forEach(w => {
    rows.push(`"${w.first_name}","${w.last_name}","${w.position}","${w.hourly_rate}","${w.actualHoursTotal}","${w.actualCostTotal}"`);
  });

  rows.push('');
  rows.push('"--- RADNI DANI ---"');
  rows.push('"Datum","Djelatnik","Pozicija","Planirano","Odrađeno","Trošak","Faze","Napomena"');

  [...data.entries]
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
    .forEach(e => {
      const w = data.workers.find(w => w.id === e.worker_id);
      const cost = w ? e.actual_hours * w.hourly_rate : 0;
      rows.push([
        `"${e.work_date}"`,
        `"${getWorkerName(e.worker_id, data.workers)}"`,
        `"${w?.position || ''}"`,
        `"${e.scheduled_hours}"`,
        `"${e.actual_hours}"`,
        `"${cost}"`,
        `"${getMilestoneNames(e.milestone_ids, data.milestones)}"`,
        `"${(e.note || '').replace(/"/g, '""')}"`,
      ].join(','));
    });

  const csvContent = rows.join('\n');
  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `evidencija_${safeName}_${formatDate(new Date()).replace(/\./g, '-')}.csv`;
  await exportTextFile(csvContent, fileName, 'text/csv', true);
};

// ============= JSON =============

export const generateWorkRecordsJSON = (data: WorkExportConfig): void => {
  const exportData = {
    generatedAt: new Date().toISOString(),
    project: data.projectName,
    summary: {
      totalWorkers: data.workers.length,
      totalWorkDays: new Set(data.entries.map(e => e.work_date)).size,
      totalScheduledHours: data.entries.reduce((s, e) => s + e.scheduled_hours, 0),
      totalActualHours: data.entries.reduce((s, e) => s + e.actual_hours, 0),
      totalCost: data.workers.reduce((s, w) => s + w.actualCostTotal, 0),
    },
    workers: data.workers.map(w => ({
      name: `${w.first_name} ${w.last_name}`,
      position: w.position,
      hourlyRate: w.hourly_rate,
      totalHours: w.actualHoursTotal,
      totalCost: w.actualCostTotal,
    })),
    milestones: data.milestones.map(m => {
      const msEntries = data.entries.filter(e => e.milestone_ids?.includes(m.id));
      return {
        name: m.name,
        totalHours: msEntries.reduce((s, e) => s + e.actual_hours, 0),
        totalCost: msEntries.reduce((s, e) => {
          const w = data.workers.find(w => w.id === e.worker_id);
          return s + (w ? e.actual_hours * w.hourly_rate : 0);
        }, 0),
      };
    }),
    entries: [...data.entries]
      .sort((a, b) => a.work_date.localeCompare(b.work_date))
      .map(e => ({
        date: e.work_date,
        worker: getWorkerName(e.worker_id, data.workers),
        scheduledHours: e.scheduled_hours,
        actualHours: e.actual_hours,
        milestones: getMilestoneNames(e.milestone_ids, data.milestones),
        note: e.note || null,
      })),
  };

  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `evidencija_${safeName}_${formatDate(new Date()).replace(/\./g, '-')}.json`;
  await exportTextFile(JSON.stringify(exportData, null, 2), fileName, 'application/json');
};
