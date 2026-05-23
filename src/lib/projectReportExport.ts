// jspdf is loaded on demand to keep it out of the initial bundle.
import type { jsPDF as JsPDFType } from 'jspdf';
import i18n from '@/i18n';
import { ProjectMilestone, MILESTONE_STATUS_LABELS } from '@/types/project';
import { exportPDFDoc, exportTextFile, type ExportMode } from '@/lib/fileExport';
import { sanitizeCsvField } from '@/lib/csvSecurity';
import { applyBrandFont, brandTableTheme, BRAND_TEAL, BRAND_TEAL_LIGHT, brandAutoTable } from '@/lib/pdfBranding';
import { drawReportHeader, drawReportFooter, REPORT_MARGIN_X } from '@/lib/pdfReportKit';
import { ensureReportLogo } from '@/lib/reportLogo';
import { buildReportFileName, loadLastConfidentiality, type ReportBrandOptions } from '@/lib/reportDesign';
import { getReportOwner } from '@/hooks/useReportOwner';

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
  contractValue?: number | null;
  totalSpent: number;
  totalAllocated: number;
  totalIncome?: number;
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

export const generateProjectPDFReport = async (
  data: ProjectReportData,
  mode: ExportMode = 'save',
  brand: ReportBrandOptions = {},
): Promise<void> => {
  const { jsPDF, autoTable } = await loadPdfLibs();
  await ensureReportLogo();
  const doc = new jsPDF();
  applyBrandFont(doc);

  const language = (brand.language || (i18n.language as any) || 'hr') as 'hr' | 'en' | 'de';
  const owner = brand.owner ?? (await getReportOwner());
  const confidentiality = brand.confidentiality ?? loadLastConfidentiality();
  const subtitle = brand.subtitle || `${i18n.t('projects.project', 'Projekt')}: ${data.projectName}`;
  const fullBrand: ReportBrandOptions = { owner, language, confidentiality, subtitle };

  const bodyStartY = drawReportHeader(doc, {
    title: i18n.t('projects.reports', 'Izvještaji projekta'),
    brand: fullBrand,
    confidentialityLabel: {
      internal: i18n.t('reportBranding.confidentiality.internal'),
      confidential: i18n.t('reportBranding.confidentiality.confidential'),
    },
  });

  // Status + description below header
  let cursorY = bodyStartY;
  doc.setFontSize(9.5);
  doc.setFont('Inter', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${i18n.t('common.status', 'Status')}: ${toAscii(data.projectStatus)}`, REPORT_MARGIN_X, cursorY);
  cursorY += 5;
  if (data.projectDescription) {
    doc.text(toAscii(data.projectDescription.substring(0, 100)), REPORT_MARGIN_X, cursorY);
    cursorY += 5;
  }
  cursorY += 4;

  doc.setFontSize(12);
  doc.setFont('Inter', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(toAscii('Budzet'), REPORT_MARGIN_X, cursorY);
  cursorY += 2;

  const remaining = data.totalBudget - data.totalSpent;
  const usedPercent = data.totalBudget > 0 
    ? ((data.totalSpent / data.totalBudget) * 100).toFixed(1) 
    : '0';

  const resolvedContract = (data.contractValue && data.contractValue > 0) ? data.contractValue : data.totalBudget;
  const collectedIncome = data.totalIncome ?? 0;
  const totalCostsAccrual = data.totalSpent;
  const cashBalance = collectedIncome - totalCostsAccrual;
  const expectedProfit = resolvedContract - totalCostsAccrual;
  const expectedMargin = resolvedContract > 0 ? (expectedProfit / resolvedContract) * 100 : 0;
  const remainingToCollect = Math.max(resolvedContract - collectedIncome, 0);

  const budgetData = [
    [toAscii('Ugovorena vrijednost'), formatCurrency(resolvedContract, data.currency)],
    [toAscii('Naplaceno'), formatCurrency(collectedIncome, data.currency)],
    [toAscii('Za naplatu'), formatCurrency(remainingToCollect, data.currency)],
    [toAscii('Ukupni budzet'), formatCurrency(data.totalBudget, data.currency)],
    [toAscii('Potroseno'), formatCurrency(data.totalSpent, data.currency)],
    [toAscii('Cash saldo'), formatCurrency(cashBalance, data.currency)],
    [toAscii('Ocekivani profit'), `${formatCurrency(expectedProfit, data.currency)} (${expectedMargin.toFixed(1)}%)`],
    [toAscii('Iskoristeno budzeta'), `${usedPercent}%`],
    [toAscii('Alocirano iz izvora'), formatCurrency(data.totalAllocated, data.currency)],
  ];

  brandAutoTable(doc, autoTable, {
    startY: cursorY + 2,
    head: [['Stavka', 'Iznos']],
    body: budgetData,
    margin: { left: REPORT_MARGIN_X },
    tableWidth: 110,
  });

  // Milestones — progress list (operational feel, not a table)
  if (data.milestones.length > 0) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const leftX = REPORT_MARGIN_X;
    const rightX = pageWidth - REPORT_MARGIN_X;
    const barWidth = rightX - leftX;
    const rowHeight = 18;
    const bottomLimit = pageHeight - 25;

    let milestoneY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont('Inter', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(toAscii(i18n.t('projects.milestones', 'Faze projekta') as string), leftX, milestoneY);
    milestoneY += 8;

    const STATUS_COLOR: Record<string, [number, number, number]> = {
      completed: [34, 197, 94],
      in_progress: BRAND_TEAL,
      overdue: [239, 68, 68],
      pending: [148, 163, 184],
    };

    for (const m of data.milestones) {
      if (milestoneY + rowHeight > bottomLimit) {
        doc.addPage();
        milestoneY = 25;
      }

      const spent = m.spent || 0;
      const ratio = m.budget > 0 ? spent / m.budget : 0;
      const pct = ratio * 100;
      const color = STATUS_COLOR[m.status] || STATUS_COLOR.pending;

      // Title line
      doc.setFontSize(10);
      doc.setFont('Inter', 'bold');
      doc.setTextColor(15, 23, 42);
      const nameText = toAscii(m.name);
      const maxNameWidth = barWidth - 70;
      let displayName = nameText;
      if (doc.getTextWidth(nameText) > maxNameWidth) {
        const r = maxNameWidth / Math.max(doc.getTextWidth(nameText), 1);
        displayName = nameText.substring(0, Math.max(1, Math.floor(nameText.length * r) - 1)) + '…';
      }
      doc.text(displayName, leftX, milestoneY);

      // Right side: spent / budget
      doc.setFont('Inter', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const amountText = `${formatCurrency(spent, data.currency)} / ${formatCurrency(m.budget, data.currency)}`;
      const amountWidth = doc.getTextWidth(amountText);
      doc.text(amountText, rightX - amountWidth, milestoneY);

      // Status + percent (small, under title)
      const statusLabel = toAscii(MILESTONE_STATUS_LABELS[m.status]);
      const metaY = milestoneY + 4.5;
      doc.setFontSize(8);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(`● ${statusLabel}`, leftX, metaY);
      doc.setTextColor(100, 116, 139);
      const pctText = `${pct.toFixed(0)}%`;
      const pctWidth = doc.getTextWidth(pctText);
      doc.text(pctText, rightX - pctWidth, metaY);

      // Progress bar
      const barY = milestoneY + 7;
      const barH = 2.2;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(leftX, barY, barWidth, barH, 1.1, 1.1, 'F');
      const fillW = Math.max(barWidth * Math.min(ratio, 1), 0);
      if (fillW > 0) {
        const overBudget = ratio > 1;
        const fc = overBudget ? [239, 68, 68] : color;
        doc.setFillColor(fc[0], fc[1], fc[2]);
        doc.roundedRect(leftX, barY, fillW, barH, 1.1, 1.1, 'F');
      }

      milestoneY += rowHeight;
    }

    (doc as any).lastAutoTable = { finalY: milestoneY - 8 };
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

    brandAutoTable(doc, autoTable, {
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

    brandAutoTable(doc, autoTable, {
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

    brandAutoTable(doc, autoTable, {
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

    brandAutoTable(doc, autoTable, {
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

  const period = formatDate(new Date()).replace(/\./g, '-');
  const fileName = buildReportFileName({ type: `projekt-${data.projectName}`, owner, period, ext: 'pdf' });
  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: i18n.t('reportBranding.pageXofY'),
    intendedForLabel: fullBrand.confidentiality !== 'none' && owner
      ? `${i18n.t('reportBranding.intendedFor')}: ${owner}`
      : undefined,
  });
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

export const generateWorkLogPDFReport = async (
  data: WorkLogReportData,
  mode: ExportMode = 'save',
  brand: ReportBrandOptions = {},
): Promise<void> => {
  const { jsPDF, autoTable } = await loadPdfLibs();
  await ensureReportLogo();
  const doc = new jsPDF();
  applyBrandFont(doc);
  const margin = REPORT_MARGIN_X;

  const language = (brand.language || (i18n.language as any) || 'hr') as 'hr' | 'en' | 'de';
  const owner = brand.owner ?? (await getReportOwner());
  const confidentiality = brand.confidentiality ?? loadLastConfidentiality();
  const range =
    data.fromDate && data.toDate
      ? `${formatDate(data.fromDate)} – ${formatDate(data.toDate)}`
      : `${toAscii('Generirano')}: ${formatDate(new Date())}`;
  const subtitle = brand.subtitle || `${i18n.t('projects.project', 'Projekt')}: ${data.projectName} · ${range}`;
  const fullBrand: ReportBrandOptions = { owner, language, confidentiality, subtitle };

  const bodyStartY = drawReportHeader(doc, {
    title: i18n.t('workLog.title', 'Dnevnik rada'),
    brand: fullBrand,
    confidentialityLabel: {
      internal: i18n.t('reportBranding.confidentiality.internal'),
      confidential: i18n.t('reportBranding.confidentiality.confidential'),
    },
  });

  // Sort entries: newest first
  const sorted = [...data.entries].sort((a, b) =>
    a.log_date < b.log_date ? 1 : -1
  );

  if (sorted.length === 0) {
    doc.setFontSize(11);
    doc.setFont('Inter', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(toAscii('Nema zapisa za odabrano razdoblje.'), margin, bodyStartY + 6);
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

    brandAutoTable(doc, autoTable, {
      startY: bodyStartY,
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

  const period = formatDate(new Date()).replace(/\./g, '-');
  const fileName = buildReportFileName({ type: `dnevnik-rada-${data.projectName}`, owner, period, ext: 'pdf' });
  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: i18n.t('reportBranding.pageXofY'),
    intendedForLabel: fullBrand.confidentiality !== 'none' && owner
      ? `${i18n.t('reportBranding.intendedFor')}: ${owner}`
      : undefined,
  });
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
