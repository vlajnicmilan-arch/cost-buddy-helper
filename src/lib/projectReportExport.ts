import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProjectMilestone, MILESTONE_STATUS_LABELS } from '@/types/project';
import { exportPDFDoc, exportTextFile } from '@/lib/fileExport';

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

export const generateProjectPDFReport = async (data: ProjectReportData): Promise<void> => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(toAscii(`Izvjestaj: ${data.projectName}`), 14, 20);
  
  // Metadata
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (data.projectDescription) {
    doc.text(toAscii(data.projectDescription.substring(0, 80)), 14, 28);
  }
  doc.text(`Status: ${toAscii(data.projectStatus)}`, 14, 34);
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 40);

  // Budget Summary
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
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
    headStyles: { fillColor: [59, 130, 246] },
    margin: { left: 14 },
    tableWidth: 100,
  });

  // Milestones
  if (data.milestones.length > 0) {
    const milestoneY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
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
      headStyles: { fillColor: [139, 92, 246] },
      margin: { left: 14 },
    });
  }

  // Members spending
  if (data.members.length > 0) {
    const memberY = (doc as any).lastAutoTable?.finalY + 15 || 120;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
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
      headStyles: { fillColor: [34, 197, 94] },
      margin: { left: 14 },
      tableWidth: 120,
    });
  }

  // Workers
  if (data.workers && data.workers.length > 0) {
    const workerY = (doc as any).lastAutoTable?.finalY + 15 || 120;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
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
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14 },
      tableWidth: 140,
    });
  }

  // Collaborators
  if (data.collaborators && data.collaborators.length > 0) {
    const collabY = (doc as any).lastAutoTable?.finalY + 15 || 120;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
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
      headStyles: { fillColor: [168, 85, 247] },
      margin: { left: 14 },
    });
  }

  // Transactions (new page)
  if (data.transactions.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
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
      headStyles: { fillColor: [107, 114, 128] },
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
  await exportPDFDoc(doc, fileName);
};

export const generateProjectCSVReport = async (data: ProjectReportData): Promise<void> => {
  // Summary section
  const summaryRows = [
    `"Projekt","${data.projectName}"`,
    `"Status","${data.projectStatus}"`,
    `"Ukupni budžet","${data.totalBudget}"`,
    `"Potrošeno","${data.totalSpent}"`,
    `"Preostalo","${data.totalBudget - data.totalSpent}"`,
    '',
    '"--- FAZE PROJEKTA ---"',
    '"Faza","Status","Budžet","Potrošeno"',
  ];

  data.milestones.forEach(m => {
    summaryRows.push(`"${m.name}","${MILESTONE_STATUS_LABELS[m.status]}","${m.budget}","${m.spent || 0}"`);
  });

  summaryRows.push('', '"--- ČLANOVI ---"', '"Ime","Uloga","Potrošnja"');
  
  data.members.forEach(m => {
    const role = m.role === 'manager' ? 'Manager' : m.role === 'member' ? 'Član' : 'Promatrač';
    summaryRows.push(`"${m.display_name || 'Nepoznato'}","${role}","${m.spent || 0}"`);
  });

  // Workers
  if (data.workers && data.workers.length > 0) {
    summaryRows.push('', '"--- RADNICI ---"', '"Ime","Sati","Satnica","Ukupno"');
    data.workers.forEach(w => {
      summaryRows.push(`"${w.name}","${w.hours.toFixed(1)}","${w.rate}","${w.cost.toFixed(2)}"`);
    });
  }

  // Collaborators
  if (data.collaborators && data.collaborators.length > 0) {
    summaryRows.push('', '"--- SURADNICI ---"', '"Ime","Usluga","Ugovoreno","Plaćeno"');
    data.collaborators.forEach(c => {
      summaryRows.push(`"${c.name}","${c.service}","${c.totalPrice}","${c.paidAmount}"`);
    });
  }

  summaryRows.push('', '"--- TRANSAKCIJE ---"', '"Datum","Opis","Faza","Tip","Iznos"');

  data.transactions
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .forEach(t => {
      const amount = t.type === 'expense' ? -t.amount : t.amount;
      summaryRows.push(`"${formatDate(t.date)}","${t.description}","${t.milestone_name || '-'}","${t.type}","${amount}"`);
    });

  const csvContent = summaryRows.join('\n');
  
  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `projekt_${safeName}_${formatDate(new Date()).replace(/\./g, '-')}.csv`;
  await exportTextFile(csvContent, fileName, 'text/csv', true);
};

export const generateProjectJSONExport = (data: ProjectReportData): void => {
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
  await exportTextFile(JSON.stringify(exportData, null, 2), fileName, 'application/json');
};
