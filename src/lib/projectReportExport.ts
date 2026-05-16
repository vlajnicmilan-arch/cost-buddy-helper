// jspdf is loaded on demand to keep it out of the initial bundle.
import type { jsPDF as JsPDFType } from 'jspdf';
import { ProjectMilestone, MILESTONE_STATUS_LABELS } from '@/types/project';
import { exportPDFDoc, exportTextFile, type ExportMode } from '@/lib/fileExport';
import { addNotOfficialFooter } from '@/lib/pdfFooter';
import { sanitizeCsvField } from '@/lib/csvSecurity';
import { applyBrandFont, brandTableTheme, BRAND_TEAL, BRAND_TEAL_LIGHT } from '@/lib/pdfBranding';

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

export interface ReportWorker {
  name: string;
  hours: number;
  rate: number;
  cost: number;
}

export interface ReportCollaborator {
  name: string;
  totalPrice: number;
  paidAmount: number;
  service: string;
}

export interface ProjectReportData {
  projectName: string;
  projectDescription?: string | null;
  projectStatus: string;
  totalBudget: number;
  totalSpent: number;
  totalAllocated: number;
  milestones: ProjectMilestone[];
  members: { display_name?: string; role: string; spent?: number }[];
  transactions: {
    date: Date;
    description: string;
    category: string;
    amount: number;
    type: string;
    milestone_name?: string;
    member_name?: string;
  }[];
  currency?: CurrencyConfig;
  workers?: ReportWorker[];
  collaborators?: ReportCollaborator[];
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

export const generateProjectPDFReport = async (data: ProjectReportData, mode: ExportMode = 'save'): Promise<void> => {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF();
  applyBrandFont(doc);
  
  // Title
  doc.setFontSize(20);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii(`Izvjestaj: ${data.projectName}`), 14, 20);
  
  // Metadata
  doc.setFontSize(10);
  doc.setFont('Inter', 'normal');
  if (data.projectDescription) {
    doc.text(toAscii(data.projectDescription.substring(0, 80)), 14, 28);
  }
  doc.text(`Status: ${toAscii(data.projectStatus)}`, 14, 34);
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 40);

  // Budget Summary
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Budzet'), 14, 52);

  const remaining = data.totalBudget - data.totalSpent;
  const usedPercent = data.totalBudget > 0 
    ? ((data.totalSpent / data.totalBudget) * 100).toFixed(1) 
    : '0';

  const budgetData = [
    [toAscii('Ukupni budzet'), formatCurrency(data.totalBudget, data.currency)],
    [toAscii('Potroseno'), formatCurrency(data.totalSpent, data.currency)],
    ['Preostalo', formatCurrency(remaining, data.currency)],
    [toAscii('Iskoristeno'), `${usedPercent}%`],
    ['Alocirano iz izvora', formatCurrency(data.totalAllocated, data.currency)],
  ];

  autoTable(doc, {
    startY: 56,
    head: [['Stavka', 'Iznos']],
    body: budgetData,
    theme: 'striped',
    headStyles: { fillColor: [35, 170, 145] },
    margin: { left: 14 },
    tableWidth: 100,
  });

  // Milestones
  if (data.milestones.length > 0) {
    const milestoneY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont('Inter', 'bold');
    doc.text('Faze projekta', 14, milestoneY);

    const milestoneData = data.milestones.map(m => {
      const spent = m.spent || 0;
      const budgetPercent = m.budget > 0 
        ? ((spent / m.budget) * 100).toFixed(1) 
        : '0';
      return [
        toAscii(m.name),
        toAscii(MILESTONE_STATUS_LABELS[m.status]),
        formatCurrency(m.budget, data.currency),
        formatCurrency(spent, data.currency),
        `${budgetPercent}%`,
      ];
    });

    autoTable(doc, {
      startY: milestoneY + 4,
      head: [['Faza', 'Status', toAscii('Budzet'), toAscii('Potroseno'), 'Udio']],
      body: milestoneData,
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
    });
  }

  // Members spending
  if (data.members.length > 0) {
    const memberY = (doc as any).lastAutoTable?.finalY + 15 || 120;
    doc.setFontSize(14);
    doc.setFont('Inter', 'bold');
    doc.text(toAscii('Clanovi tima'), 14, memberY);

    const memberData = data.members.map(m => [
      toAscii(m.display_name || 'Nepoznato'),
      toAscii(m.role === 'manager' ? 'Manager' : m.role === 'member' ? 'Clan' : 'Promatrac'),
      formatCurrency(m.spent || 0, data.currency),
    ]);

    autoTable(doc, {
      startY: memberY + 4,
      head: [['Ime', 'Uloga', toAscii('Potrosnja')]],
      body: memberData,
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  // Workers
  if (data.workers && data.workers.length > 0) {
    const workerY = (doc as any).lastAutoTable?.finalY + 15 || 120;
    doc.setFontSize(14);
    doc.setFont('Inter', 'bold');
    doc.text('Radnici', 14, workerY);

    const workerData = data.workers.map(w => [
      toAscii(w.name),
      `${w.hours.toFixed(1)}h`,
      formatCurrency(w.rate, data.currency) + '/h',
      formatCurrency(w.cost, data.currency),
    ]);

    autoTable(doc, {
      startY: workerY + 4,
      head: [['Ime', 'Sati', 'Satnica', 'Ukupno']],
      body: workerData,
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
      tableWidth: 140,
    });
  }

  // Collaborators
  if (data.collaborators && data.collaborators.length > 0) {
    const collabY = (doc as any).lastAutoTable?.finalY + 15 || 120;
    doc.setFontSize(14);
    doc.setFont('Inter', 'bold');
    doc.text('Suradnici', 14, collabY);

    const collabData = data.collaborators.map(c => [
      toAscii(c.name),
      toAscii(c.service),
      formatCurrency(c.totalPrice, data.currency),
      formatCurrency(c.paidAmount, data.currency),
    ]);

    autoTable(doc, {
      startY: collabY + 4,
      head: [['Ime', 'Usluga', 'Ugovoreno', toAscii('Placeno')]],
      body: collabData,
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
    });
  }

  // Transactions (new page)
  if (data.transactions.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('Inter', 'bold');
    doc.text('Popis transakcija', 14, 20);

    const transactionData = data.transactions
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map(t => [
        formatDate(t.date),
        toAscii(t.description),
        toAscii(t.milestone_name || '-'),
        t.type === 'expense' 
          ? `-${formatCurrency(t.amount, data.currency)}` 
          : formatCurrency(t.amount, data.currency),
      ]);

    autoTable(doc, {
      startY: 24,
      head: [['Datum', 'Opis', 'Faza', 'Iznos']],
      body: transactionData,
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145] },
      margin: { left: 14 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 80 },
        2: { cellWidth: 40 },
        3: { cellWidth: 30 },
      },
    });
  }

  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `projekt_${safeName}_${formatDate(new Date()).replace(/\./g, '-')}.pdf`;
  addNotOfficialFooter(doc);
  await exportPDFDoc(doc, fileName, mode);
};

export const generateProjectCSVReport = async (data: ProjectReportData, mode: ExportMode = 'save'): Promise<void> => {
  // CSV injection zaštita: sva tekstualna polja prolaze kroz sanitizeCsvField
  // (prefixira razmakom ako počinju s =, +, -, @). Vidi src/lib/csvSecurity.ts.
  const s = (v: string | number | undefined | null) =>
    typeof v === 'string' ? sanitizeCsvField(v).replace(/"/g, '""') : String(v ?? '');

  // Summary section
  const summaryRows = [
    `"Projekt","${s(data.projectName)}"`,
    `"Status","${s(data.projectStatus)}"`,
    `"Ukupni budžet","${data.totalBudget}"`,
    `"Potrošeno","${data.totalSpent}"`,
    `"Preostalo","${data.totalBudget - data.totalSpent}"`,
    '',
    '"--- FAZE PROJEKTA ---"',
    '"Faza","Status","Budžet","Potrošeno"',
  ];

  data.milestones.forEach(m => {
    summaryRows.push(`"${s(m.name)}","${s(MILESTONE_STATUS_LABELS[m.status])}","${m.budget}","${m.spent || 0}"`);
  });

  summaryRows.push('', '"--- ČLANOVI ---"', '"Ime","Uloga","Potrošnja"');
  
  data.members.forEach(m => {
    const role = m.role === 'manager' ? 'Manager' : m.role === 'member' ? 'Član' : 'Promatrač';
    summaryRows.push(`"${s(m.display_name || 'Nepoznato')}","${role}","${m.spent || 0}"`);
  });

  // Workers
  if (data.workers && data.workers.length > 0) {
    summaryRows.push('', '"--- RADNICI ---"', '"Ime","Sati","Satnica","Ukupno"');
    data.workers.forEach(w => {
      summaryRows.push(`"${s(w.name)}","${w.hours.toFixed(1)}","${w.rate}","${w.cost.toFixed(2)}"`);
    });
  }

  // Collaborators
  if (data.collaborators && data.collaborators.length > 0) {
    summaryRows.push('', '"--- SURADNICI ---"', '"Ime","Usluga","Ugovoreno","Plaćeno"');
    data.collaborators.forEach(c => {
      summaryRows.push(`"${s(c.name)}","${s(c.service)}","${c.totalPrice}","${c.paidAmount}"`);
    });
  }

  summaryRows.push('', '"--- TRANSAKCIJE ---"', '"Datum","Opis","Faza","Tip","Iznos"');

  data.transactions
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .forEach(t => {
      const amount = t.type === 'expense' ? -t.amount : t.amount;
      summaryRows.push(`"${formatDate(t.date)}","${s(t.description)}","${s(t.milestone_name || '-')}","${s(t.type)}","${amount}"`);
    });

  const csvContent = summaryRows.join('\n');
  
  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `projekt_${safeName}_${formatDate(new Date()).replace(/\./g, '-')}.csv`;
  await exportTextFile(csvContent, fileName, 'text/csv', true, mode);
};

// ===== Work Log PDF Export =====

export interface WorkLogEntry {
  log_date: string; // YYYY-MM-DD
  weather?: string | null;
  summary: string;
  notes?: string | null;
  milestone_name?: string | null;
  user_name?: string | null;
  hours?: { worker_name: string; actual_hours: number }[];
}

export interface WorkLogReportData {
  projectName: string;
  fromDate?: Date;
  toDate?: Date;
  entries: WorkLogEntry[];
}

export const generateWorkLogPDFReport = async (data: WorkLogReportData, mode: ExportMode = 'save'): Promise<void> => {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF();
  applyBrandFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Title
  doc.setFontSize(18);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Dnevnik rada'), margin, 18);

  // Subtitle
  doc.setFontSize(11);
  doc.setFont('Inter', 'normal');
  doc.text(toAscii(`Projekt: ${data.projectName}`), margin, 26);

  const range =
    data.fromDate && data.toDate
      ? `${formatDate(data.fromDate)} - ${formatDate(data.toDate)}`
      : `${toAscii('Generirano')}: ${formatDate(new Date())}`;
  doc.setFontSize(9);
  doc.text(range, margin, 32);

  // Sort entries: newest first
  const sorted = [...data.entries].sort((a, b) =>
    a.log_date < b.log_date ? 1 : -1
  );

  if (sorted.length === 0) {
    doc.setFontSize(11);
    doc.text(toAscii('Nema zapisa za odabrano razdoblje.'), margin, 50);
  } else {
    const rows = sorted.map((e) => {
      const dateLabel = (() => {
        try {
          return new Date(e.log_date + 'T00:00:00').toLocaleDateString('hr-HR');
        } catch {
          return e.log_date;
        }
      })();
      const weather = e.weather ? toAscii(e.weather) : '-';
      const milestone = e.milestone_name ? toAscii(e.milestone_name) : '-';
      const author = e.user_name ? toAscii(e.user_name) : '-';
      const hoursText =
        e.hours && e.hours.length > 0
          ? e.hours
              .map((h) => `${toAscii(h.worker_name)} (${h.actual_hours.toFixed(1)}h)`)
              .join(', ')
          : '-';
      const summary = toAscii(e.summary || '');
      const notes = e.notes ? toAscii(e.notes) : '';
      const combined = notes ? `${summary}\n\n${toAscii('Napomene')}: ${notes}` : summary;
      return [dateLabel, weather, milestone, author, hoursText, combined];
    });

    autoTable(doc, {
      startY: 38,
      head: [
        [
          'Datum',
          toAscii('Vrijeme'),
          'Faza',
          'Autor',
          'Sati',
          toAscii('Sto je radjeno / Napomene'),
        ],
      ],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [35, 170, 145], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2, valign: 'top' },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 32 },
        5: { cellWidth: 'auto' },
      },
      margin: { left: margin, right: margin },
    });
  }

  // Footer page numbers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('Inter', 'normal');
    doc.text(
      `${i} / ${totalPages}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    );
  }

  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `dnevnik_${safeName}_${formatDate(new Date()).replace(/\./g, '-')}.pdf`;
  addNotOfficialFooter(doc);
  await exportPDFDoc(doc, fileName, mode);
};

export const generateProjectJSONExport = async (data: ProjectReportData, mode: ExportMode = 'save'): Promise<void> => {
  const exportData = {
    generatedAt: new Date().toISOString(),
    project: {
      name: data.projectName,
      description: data.projectDescription,
      status: data.projectStatus,
    },
    budget: {
      total: data.totalBudget,
      spent: data.totalSpent,
      remaining: data.totalBudget - data.totalSpent,
      allocated: data.totalAllocated,
    },
    milestones: data.milestones.map(m => ({
      name: m.name,
      status: m.status,
      budget: m.budget,
      spent: m.spent || 0,
      startDate: m.start_date,
      dueDate: m.due_date,
    })),
    members: data.members.map(m => ({
      name: m.display_name || 'Unknown',
      role: m.role,
      spent: m.spent || 0,
    })),
    transactions: data.transactions.map(t => ({
      date: t.date.toISOString(),
      description: t.description,
      category: t.category,
      amount: t.amount,
      type: t.type,
      milestone: t.milestone_name,
    })),
    workers: data.workers?.map(w => ({
      name: w.name,
      hours: w.hours,
      hourlyRate: w.rate,
      totalCost: w.cost,
    })) || [],
    collaborators: data.collaborators?.map(c => ({
      name: c.name,
      service: c.service,
      agreedPrice: c.totalPrice,
      paidAmount: c.paidAmount,
    })) || [],
  };

  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `projekt_${safeName}_${formatDate(new Date()).replace(/\./g, '-')}.json`;
  await exportTextFile(JSON.stringify(exportData, null, 2), fileName, 'application/json', false, mode);
};
