// Standalone QA script: renderira sve PDF izvještaje iz V&M Balance
// s realističnim izmišljenim podacima u /mnt/documents/reports-preview/.
//
// Pokretanje: bun scripts/render-all-reports.mjs
//
// Logika je vjerno replicirana iz produkcijskih export funkcija:
//   - src/lib/reportExport.ts            (generatePDFReport, generateIncomePDFReport)
//   - src/lib/projectReportExport.ts     (generateProjectPDFReport, generateWorkLogPDFReport)
//   - src/lib/workRecordsExport.ts       (generateWorkRecordsPDF)
//   - src/components/SpendingCalendar.tsx        (exportDayPDF)
//   - src/components/reports/ItemsAnalysisTab.tsx (handleExportPDF)
//   - src/components/business/BusinessReports.tsx (exportPDF)
//   - src/components/projects/WorkLogMonthlyOverview.tsx (handleExportPdf)
//   - src/components/FinancialAssistantDialog.tsx (exportToPDF, exportResponseAsPDF)
//
// Ako se logika u tim datotekama mijenja, treba i ovdje.

import { jsPDF } from 'jspdf/dist/jspdf.es.min.js';
import autoTable from 'jspdf-autotable';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/mnt/documents/reports-preview';
fs.mkdirSync(OUT, { recursive: true });

// ============================================================
// Helpers (kopirano iz src/lib/* + src/lib/pdfBranding.ts)
// ============================================================

// Brand
const BRAND_TEAL = [35, 170, 145];
const BRAND_TEAL_LIGHT = [230, 247, 243];
const BRAND_DARK = [15, 23, 42];

// Inter font (UTF-8 podrška + bez Helvetica-Bold bug-a)
const INTER_REGULAR_B64 = fs.readFileSync('src/assets/fonts/Inter-Regular.ttf').toString('base64');
const INTER_BOLD_B64 = fs.readFileSync('src/assets/fonts/Inter-Bold.ttf').toString('base64');
const applyBrandFont = (doc) => {
  doc.addFileToVFS('Inter-Regular.ttf', INTER_REGULAR_B64);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', INTER_BOLD_B64);
  doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
  doc.setFont('Inter', 'normal');
};
const BRAND_TABLE_THEME = {
  theme: 'striped',
  styles: { font: 'Inter', fontSize: 9, cellPadding: 3, textColor: BRAND_DARK },
  headStyles: { font: 'Inter', fontStyle: 'bold', fillColor: BRAND_TEAL, textColor: [255, 255, 255], fontSize: 9 },
  alternateRowStyles: { fillColor: BRAND_TEAL_LIGHT },
};
const brandAutoTable = (doc, opts) => {
  autoTable(doc, {
    ...BRAND_TABLE_THEME,
    ...opts,
    styles: { ...BRAND_TABLE_THEME.styles, ...(opts?.styles || {}) },
    headStyles: { ...BRAND_TABLE_THEME.headStyles, ...(opts?.headStyles || {}) },
    alternateRowStyles: { ...BRAND_TABLE_THEME.alternateRowStyles, ...(opts?.alternateRowStyles || {}) },
  });
};

// toAscii sada identity — Inter font podržava UTF-8
const toAscii = (text) => String(text || '');

const formatDate = (d) => new Date(d).toLocaleDateString('hr-HR');
const formatCurrency = (n) =>
  new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(n);

const addNotOfficialFooter = (doc) => {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(7);
    doc.setFont('Inter', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Generirano iz V&M Balance — alat za interno upravljanje projektima.',
      pageWidth / 2, pageHeight - 8, { align: 'center' });
    doc.text('Nije službena evidencija u smislu Zakona o radu / Zakona o računovodstvu / Zakona o porezu.',
      pageWidth / 2, pageHeight - 5, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }
};

const savePdf = (doc, fileName) => {
  const ab = doc.output('arraybuffer');
  const full = path.join(OUT, fileName);
  fs.writeFileSync(full, Buffer.from(ab));
  console.log('✓', fileName);
};

// ============================================================
// Mock podaci
// ============================================================

const CATEGORY_NAMES = {
  food: 'Hrana', groceries: 'Namirnice', transport: 'Prijevoz', car: 'Automobil',
  shopping: 'Kupovina', clothing: 'Odjeća', entertainment: 'Zabava', subscriptions: 'Pretplate',
  bills: 'Računi', utilities: 'Režije', rent: 'Najam', health: 'Zdravlje',
  beauty: 'Ljepota', sports: 'Sport', education: 'Obrazovanje', travel: 'Putovanja',
  home: 'Dom', pets: 'Ljubimci', gifts: 'Pokloni', kids: 'Djeca',
  insurance: 'Osiguranje', taxes: 'Porezi', savings: 'Štednja', investments: 'Investicije',
  charity: 'Donacije', other: 'Ostalo',
};

const PAYMENT_SOURCES = {
  cash: 'Gotovina', bank: 'Banka', visa: 'Visa', mastercard: 'Mastercard',
  revolut: 'Revolut', aircash: 'Aircash',
};

const TYPE_NAMES = { expense: 'Trošak', income: 'Prihod', transfer: 'Prijenos' };

const d = (yyyy, mm, dd) => new Date(yyyy, mm - 1, dd);

const expenses = [
  { id: '1',  amount: 145.30, description: 'Konzum tjedna kupovina',     category: 'groceries', type: 'expense', payment_source: 'visa',       date: d(2026, 4, 28) },
  { id: '2',  amount: 38.50,  description: 'Ručak u Bistrou Šibenik',    category: 'food',      type: 'expense', payment_source: 'cash',       date: d(2026, 4, 27) },
  { id: '3',  amount: 89.00,  description: 'Gorivo INA — Đakovo',        category: 'car',       type: 'expense', payment_source: 'mastercard', date: d(2026, 4, 26) },
  { id: '4',  amount: 1850.00, description: 'Plaća — Tehnologija d.o.o.', category: 'salary',   type: 'income',  payment_source: 'bank',       date: d(2026, 4, 25) },
  { id: '5',  amount: 65.20,  description: 'Netflix + Spotify',          category: 'subscriptions', type: 'expense', payment_source: 'revolut', date: d(2026, 4, 24) },
  { id: '6',  amount: 420.00, description: 'Najam stana — svibanj',      category: 'rent',      type: 'expense', payment_source: 'bank',       date: d(2026, 4, 23) },
  { id: '7',  amount: 27.80,  description: 'Apoteka — vitamini',         category: 'health',    type: 'expense', payment_source: 'visa',       date: d(2026, 4, 22) },
  { id: '8',  amount: 350.00, description: 'Honorar — dizajn za Đorđevića', category: 'freelance', type: 'income', payment_source: 'bank',     date: d(2026, 4, 22) },
  { id: '9',  amount: 12.00,  description: 'Bus karta ZET',              category: 'transport', type: 'expense', payment_source: 'cash',       date: d(2026, 4, 21) },
  { id: '10', amount: 76.40,  description: 'Tisak — Hrvatski telekom',   category: 'bills',     type: 'expense', payment_source: 'bank',       date: d(2026, 4, 20) },
  { id: '11', amount: 95.00,  description: 'HEP — struja travanj',       category: 'utilities', type: 'expense', payment_source: 'bank',       date: d(2026, 4, 20) },
  { id: '12', amount: 18.50,  description: 'Pivo s ekipom — Šestinski lagvić', category: 'entertainment', type: 'expense', payment_source: 'cash', date: d(2026, 4, 19) },
  { id: '13', amount: 240.00, description: 'Nike tenisice',              category: 'clothing',  type: 'expense', payment_source: 'visa',       date: d(2026, 4, 18) },
  { id: '14', amount: 33.00,  description: 'Knjiga "Hrvatska povijest"', category: 'education', type: 'expense', payment_source: 'visa',       date: d(2026, 4, 17) },
  { id: '15', amount: 8.40,   description: 'McDonalds Avenue Mall',      category: 'food',      type: 'expense', payment_source: 'aircash',    date: d(2026, 4, 16) },
  { id: '16', amount: 120.00, description: 'Hotel Šibenik — vikend',     category: 'travel',    type: 'expense', payment_source: 'mastercard', date: d(2026, 4, 15) },
  { id: '17', amount: 200.00, description: 'Prodaja stare bicikle',      category: 'sale',      type: 'income',  payment_source: 'cash',       date: d(2026, 4, 14) },
  { id: '18', amount: 14.90,  description: 'Cvjećara — buket za mamu',   category: 'gifts',     type: 'expense', payment_source: 'cash',       date: d(2026, 4, 13) },
  { id: '19', amount: 49.00,  description: 'Veterinar — Žužu',           category: 'pets',      type: 'expense', payment_source: 'visa',       date: d(2026, 4, 12) },
  { id: '20', amount: 28.30,  description: 'Lidl — voće i povrće',       category: 'groceries', type: 'expense', payment_source: 'cash',       date: d(2026, 4, 11) },
  { id: '21', amount: 110.00, description: 'Auto-osiguranje — rata',     category: 'insurance', type: 'expense', payment_source: 'bank',       date: d(2026, 4, 10) },
  { id: '22', amount: 22.00,  description: 'Kino — film s djecom',       category: 'entertainment', type: 'expense', payment_source: 'cash',   date: d(2026, 4, 9) },
  { id: '23', amount: 75.00,  description: 'Frizer & kozmetičarka',      category: 'beauty',    type: 'expense', payment_source: 'visa',       date: d(2026, 4, 8) },
  { id: '24', amount: 55.00,  description: 'Sport — članarina u dvorani', category: 'sports',  type: 'expense', payment_source: 'bank',       date: d(2026, 4, 7) },
  { id: '25', amount: 130.00, description: 'Poklon za rođendan',         category: 'gifts',     type: 'expense', payment_source: 'visa',       date: d(2026, 4, 5) },
  { id: '26', amount: 80.00,  description: 'Donacija — Crveni križ',     category: 'charity',   type: 'expense', payment_source: 'bank',       date: d(2026, 4, 3) },
];

const computeTotals = (txs) => {
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp    = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const tr     = txs.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0);
  return { income, expenses: exp, balance: income - exp, transfers: tr };
};

const computeByCategory = (txs, type) => {
  const out = {};
  txs.filter(t => t.type === type).forEach(t => {
    out[t.category] = (out[t.category] || 0) + t.amount;
  });
  return out;
};

const computeByPaymentSource = (txs) => {
  const out = {};
  txs.forEach(t => { out[t.payment_source] = (out[t.payment_source] || 0) + t.amount; });
  return out;
};

const getCategoryName = (id) => CATEGORY_NAMES[id] || id;

// ============================================================
// 01. Financial Expenses Report (generatePDFReport)
// ============================================================
function render01_financialExpenses() {
  const data = {
    expenses,
    dateRange: { start: d(2026, 4, 1), end: d(2026, 4, 30) },
    totals: computeTotals(expenses),
    byCategory: computeByCategory(expenses, 'expense'),
    byPaymentSource: computeByPaymentSource(expenses),
  };
  const reportTitle = 'Financijsko izvješće — travanj 2026';

  const doc = new jsPDF();
  applyBrandFont(doc);
  doc.setFontSize(20);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii(reportTitle), 14, 20);

  doc.setFontSize(10);
  doc.setFont('Inter', 'normal');
  doc.text(`Razdoblje: ${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`, 14, 28);
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 34);

  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Sazetak'), 14, 46);

  brandAutoTable(doc, {
    startY: 50,
    head: [['Stavka', 'Iznos']],
    body: [
      [toAscii('Ukupni prihodi'), formatCurrency(data.totals.income)],
      [toAscii('Ukupni troskovi'), formatCurrency(data.totals.expenses)],
      ['Stanje', formatCurrency(data.totals.balance)],
      ['Prijenosi', formatCurrency(data.totals.transfers)],
    ],
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    tableWidth: 80,
  });

  const catY = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Troskovi po kategorijama'), 14, catY);

  const catRows = Object.entries(data.byCategory)
    .filter(([, a]) => a > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, a]) => [
      toAscii(getCategoryName(id)),
      formatCurrency(a),
      `${((a / data.totals.expenses) * 100).toFixed(1)}%`,
    ]);

  brandAutoTable(doc, {
    startY: catY + 4,
    head: [['Kategorija', 'Iznos', 'Udio']],
    body: catRows,
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    tableWidth: 120,
  });

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Popis transakcija', 14, 20);

  const txRows = [...data.expenses]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(e => [
      formatDate(e.date),
      toAscii(TYPE_NAMES[e.type]),
      toAscii(e.description),
      toAscii(getCategoryName(e.category)),
      e.type === 'expense' ? `-${formatCurrency(e.amount)}` : formatCurrency(e.amount),
    ]);

  brandAutoTable(doc, {
    startY: 24,
    head: [['Datum', 'Tip', 'Opis', 'Kategorija', 'Iznos']],
    body: txRows,
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 20 }, 2: { cellWidth: 60 },
      3: { cellWidth: 30 }, 4: { cellWidth: 30 },
    },
  });

  addNotOfficialFooter(doc);
  savePdf(doc, '01-financial-expenses.pdf');
}

// ============================================================
// 02. Income Report (generateIncomePDFReport)
// ============================================================
function render02_incomeReport() {
  const incomeTransactions = expenses.filter(e => e.type === 'income');
  // Augment with a few more incomes for richer report
  const extra = [
    { id: 'i1', amount: 1850.00, description: 'Plaća — ožujak',       category: 'salary',       type: 'income', payment_source: 'bank', date: d(2026, 3, 25) },
    { id: 'i2', amount: 450.00,  description: 'Honorar — Šimić d.o.o.', category: 'freelance', type: 'income', payment_source: 'bank', date: d(2026, 4, 18) },
    { id: 'i3', amount: 100.00,  description: 'Poklon — rođendan',     category: 'gift_income',  type: 'income', payment_source: 'cash', date: d(2026, 4, 12) },
    { id: 'i4', amount: 75.00,   description: 'Prodaja knjiga — Njuškalo', category: 'sale',     type: 'income', payment_source: 'aircash', date: d(2026, 4, 8) },
  ];
  const all = [...incomeTransactions, ...extra];
  const total = all.reduce((s, e) => s + e.amount, 0);
  const byCat = {};
  all.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });

  const INCOME_NAMES = {
    salary: 'Plaća', freelance: 'Honorar', gift_income: 'Poklon', sale: 'Prodaja',
    mortgage: 'Stambeni kredit', personal_loan: 'Nenamjenski kredit', other_income: 'Ostalo',
  };

  const data = {
    incomeTransactions: all,
    dateRange: { start: d(2026, 3, 1), end: d(2026, 4, 30) },
    totalIncome: total,
    byCategory: byCat,
  };

  const doc = new jsPDF();
  applyBrandFont(doc);
  doc.setFontSize(20);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Izvjesce o prihodima'), 14, 20);

  doc.setFontSize(10);
  doc.setFont('Inter', 'normal');
  doc.text(`Razdoblje: ${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`, 14, 28);
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 34);

  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Sazetak prihoda'), 14, 46);

  brandAutoTable(doc, {
    startY: 50,
    head: [['Stavka', 'Vrijednost']],
    body: [
      [toAscii('Ukupni prihodi'), formatCurrency(data.totalIncome)],
      ['Broj transakcija', String(data.incomeTransactions.length)],
    ],
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    tableWidth: 80,
  });

  const catY = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Prihodi po kategorijama', 14, catY);

  const catRows = Object.entries(data.byCategory)
    .filter(([, a]) => a > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, a]) => [
      toAscii(INCOME_NAMES[id] || id),
      formatCurrency(a),
      `${((a / data.totalIncome) * 100).toFixed(1)}%`,
    ]);

  brandAutoTable(doc, {
    startY: catY + 4,
    head: [['Kategorija', 'Iznos', 'Udio']],
    body: catRows,
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    tableWidth: 120,
  });

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Popis prihoda', 14, 20);

  const rows = [...data.incomeTransactions]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(i => [
      formatDate(i.date),
      toAscii(i.description),
      toAscii(INCOME_NAMES[i.category] || i.category),
      formatCurrency(i.amount),
    ]);

  brandAutoTable(doc, {
    startY: 24,
    head: [['Datum', 'Opis', 'Kategorija', 'Iznos']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 30 }, 1: { cellWidth: 80 }, 2: { cellWidth: 40 }, 3: { cellWidth: 35 },
    },
  });

  addNotOfficialFooter(doc);
  savePdf(doc, '02-income-report.pdf');
}

// ============================================================
// 03. Project Report (generateProjectPDFReport)
// ============================================================
const MILESTONE_STATUS = {
  pending: 'Na čekanju', active: 'U tijeku', completed: 'Završeno', overdue: 'Kasni',
};

function render03_projectReport() {
  const milestones = [
    { id: 'm1', name: 'Priprema i projektna dokumentacija', status: 'completed', budget: 8500,  spent: 8720,  due_date: '2026-02-15', start_date: '2026-01-10' },
    { id: 'm2', name: 'Građevinski radovi — temelji',       status: 'completed', budget: 22000, spent: 21450, due_date: '2026-03-20', start_date: '2026-02-16' },
    { id: 'm3', name: 'Instalacije (struja, voda, plin)',   status: 'active',    budget: 14500, spent: 9300,  due_date: '2026-05-30', start_date: '2026-03-21' },
    { id: 'm4', name: 'Završni stolarski radovi i predaja', status: 'pending',   budget: 11000, spent: 0,     due_date: '2026-07-15', start_date: '2026-06-01' },
  ];

  const data = {
    projectName: 'Adaptacija kuće — Šibenik',
    projectDescription: 'Kompletna adaptacija obiteljske kuće u staroj jezgri Šibenika, uključujući instalacije i završne radove.',
    projectStatus: 'U tijeku',
    totalBudget: 56000,
    totalSpent: milestones.reduce((s, m) => s + m.spent, 0),
    totalAllocated: 56000,
    milestones,
    members: [
      { display_name: 'Marko Žužić',       role: 'manager',  spent: 12400 },
      { display_name: 'Ana Đurđević',      role: 'member',   spent: 18200 },
      { display_name: 'Petar Šimić',       role: 'member',   spent: 8870  },
      { display_name: 'Iva Čović',         role: 'viewer',   spent: 0     },
    ],
    workers: [
      { name: 'Tomislav Horvat',  hours: 142.5, rate: 18, cost: 2565 },
      { name: 'Stipe Šaravanja',  hours: 98.0,  rate: 16, cost: 1568 },
      { name: 'Krešimir Đikić',   hours: 76.5,  rate: 22, cost: 1683 },
    ],
    collaborators: [
      { name: 'Elektro Šibenik d.o.o.',  service: 'Električne instalacije', totalPrice: 6500, paidAmount: 3000 },
      { name: 'Vodoinstalater Čović',    service: 'Vodoinstalacije',       totalPrice: 4200, paidAmount: 4200 },
      { name: 'Stolarija Đakovo',        service: 'Unutarnja vrata i stolarija', totalPrice: 5800, paidAmount: 1500 },
    ],
    transactions: [
      { date: d(2026, 4, 25), description: 'Bauhaus — kabeli i utičnice',   category: 'home', amount: 845.20,  type: 'expense', milestone_name: 'Instalacije' },
      { date: d(2026, 4, 22), description: 'Pago — cijevi i fitinzi',       category: 'home', amount: 432.10,  type: 'expense', milestone_name: 'Instalacije' },
      { date: d(2026, 4, 18), description: 'Račun za drvenu građu',         category: 'home', amount: 1890.00, type: 'expense', milestone_name: 'Završni radovi' },
      { date: d(2026, 4, 15), description: 'Honorar električar — 1. faza', category: 'home', amount: 1500.00, type: 'expense', milestone_name: 'Instalacije' },
      { date: d(2026, 4, 12), description: 'Predujam — investitor',         category: 'sale', amount: 10000.00, type: 'income',  milestone_name: '-' },
      { date: d(2026, 4, 10), description: 'Bager — najam za iskop',        category: 'home', amount: 680.00,  type: 'expense', milestone_name: 'Temelji' },
      { date: d(2026, 4, 8),  description: 'Cement i armatura',             category: 'home', amount: 2340.00, type: 'expense', milestone_name: 'Temelji' },
      { date: d(2026, 4, 5),  description: 'Geodetski snimak parcele',      category: 'home', amount: 450.00,  type: 'expense', milestone_name: 'Priprema' },
      { date: d(2026, 4, 2),  description: 'Projektna dokumentacija — Šimić arhitekti', category: 'home', amount: 3200.00, type: 'expense', milestone_name: 'Priprema' },
      { date: d(2026, 3, 28), description: 'Trafostanica — priključak',     category: 'home', amount: 1620.00, type: 'expense', milestone_name: 'Instalacije' },
    ],
  };

  const doc = new jsPDF();
  applyBrandFont(doc);
  doc.setFontSize(20);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii(`Izvjestaj: ${data.projectName}`), 14, 20);

  doc.setFontSize(10);
  doc.setFont('Inter', 'normal');
  if (data.projectDescription) {
    doc.text(toAscii(data.projectDescription.substring(0, 80)), 14, 28);
  }
  doc.text(`Status: ${toAscii(data.projectStatus)}`, 14, 34);
  doc.text(`Generirano: ${formatDate(new Date())}`, 14, 40);

  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Budzet'), 14, 52);

  const remaining = data.totalBudget - data.totalSpent;
  const usedPct = ((data.totalSpent / data.totalBudget) * 100).toFixed(1);

  brandAutoTable(doc, {
    startY: 56,
    head: [['Stavka', 'Iznos']],
    body: [
      [toAscii('Ukupni budzet'), formatCurrency(data.totalBudget)],
      [toAscii('Potroseno'), formatCurrency(data.totalSpent)],
      ['Preostalo', formatCurrency(remaining)],
      [toAscii('Iskoristeno'), `${usedPct}%`],
      ['Alocirano iz izvora', formatCurrency(data.totalAllocated)],
    ],
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    tableWidth: 100,
  });

  let y = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Faze projekta', 14, y);

  brandAutoTable(doc, {
    startY: y + 4,
    head: [['Faza', 'Status', toAscii('Budzet'), toAscii('Potroseno'), 'Udio']],
    body: data.milestones.map(m => [
      toAscii(m.name),
      toAscii(MILESTONE_STATUS[m.status]),
      formatCurrency(m.budget),
      formatCurrency(m.spent),
      `${((m.spent / m.budget) * 100).toFixed(1)}%`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
  });

  y = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Clanovi tima'), 14, y);

  brandAutoTable(doc, {
    startY: y + 4,
    head: [['Ime', 'Uloga', toAscii('Potrosnja')]],
    body: data.members.map(m => [
      toAscii(m.display_name),
      toAscii(m.role === 'manager' ? 'Manager' : m.role === 'member' ? 'Clan' : 'Promatrac'),
      formatCurrency(m.spent),
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    tableWidth: 120,
  });

  y = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Radnici', 14, y);

  brandAutoTable(doc, {
    startY: y + 4,
    head: [['Ime', 'Sati', 'Satnica', 'Ukupno']],
    body: data.workers.map(w => [
      toAscii(w.name),
      `${w.hours.toFixed(1)}h`,
      formatCurrency(w.rate) + '/h',
      formatCurrency(w.cost),
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    tableWidth: 140,
  });

  y = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Suradnici', 14, y);

  brandAutoTable(doc, {
    startY: y + 4,
    head: [['Ime', 'Usluga', 'Ugovoreno', toAscii('Placeno')]],
    body: data.collaborators.map(c => [
      toAscii(c.name),
      toAscii(c.service),
      formatCurrency(c.totalPrice),
      formatCurrency(c.paidAmount),
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
  });

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('Inter', 'bold');
  doc.text('Popis transakcija', 14, 20);

  brandAutoTable(doc, {
    startY: 24,
    head: [['Datum', 'Opis', 'Faza', 'Iznos']],
    body: [...data.transactions]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map(t => [
        formatDate(t.date),
        toAscii(t.description),
        toAscii(t.milestone_name || '-'),
        t.type === 'expense' ? `-${formatCurrency(t.amount)}` : formatCurrency(t.amount),
      ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL },
    margin: { left: 14 },
    styles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 80 }, 2: { cellWidth: 40 }, 3: { cellWidth: 30 } },
  });

  addNotOfficialFooter(doc);
  savePdf(doc, '03-project-summary.pdf');
}

// ============================================================
// 04. Project Work Log (generateWorkLogPDFReport)
// ============================================================
function render04_projectWorkLog() {
  const data = {
    projectName: 'Adaptacija kuće — Šibenik',
    fromDate: d(2026, 4, 1),
    toDate: d(2026, 4, 30),
    entries: [
      { log_date: '2026-04-28', weather: 'Sunčano, 22°C', summary: 'Postavljanje glavnih el. vodova u prizemlju. Završeni dovodi za kuhinju i kupaonicu.', notes: 'Sutra dolazi inspektor.', milestone_name: 'Instalacije', user_name: 'Marko Žužić', hours: [{ worker_name: 'Tomislav', actual_hours: 8 }, { worker_name: 'Stipe', actual_hours: 7.5 }] },
      { log_date: '2026-04-25', weather: 'Oblačno', summary: 'Iskop kanala za vodovodne cijevi u dvorištu.', notes: null, milestone_name: 'Instalacije', user_name: 'Marko Žužić', hours: [{ worker_name: 'Krešimir', actual_hours: 9 }] },
      { log_date: '2026-04-22', weather: 'Kiša', summary: 'Prekid radova zbog kiše. Inventura materijala u skladištu.', notes: 'Pad satova zbog vremena.', milestone_name: 'Instalacije', user_name: 'Ana Đurđević', hours: [] },
      { log_date: '2026-04-18', weather: 'Vjetar', summary: 'Dostava drvene građe — kontrola količina i kvalitete.', notes: 'Jedna gajba bila oštećena, reklamirana dobavljaču.', milestone_name: 'Završni radovi', user_name: 'Petar Šimić', hours: [{ worker_name: 'Tomislav', actual_hours: 6 }] },
      { log_date: '2026-04-15', weather: 'Sunčano', summary: 'Postavljanje razvodnih ormarića. Glavna sklopka spojena.', notes: null, milestone_name: 'Instalacije', user_name: 'Marko Žužić', hours: [{ worker_name: 'Tomislav', actual_hours: 8 }, { worker_name: 'Stipe', actual_hours: 8 }, { worker_name: 'Krešimir', actual_hours: 4 }] },
      { log_date: '2026-04-10', weather: 'Sunčano', summary: 'Bager iskop temelja — sjeverna strana. Iskop dubok 1.2m.', notes: null, milestone_name: 'Temelji', user_name: 'Marko Žužić', hours: [{ worker_name: 'Krešimir', actual_hours: 10 }] },
    ],
  };

  const doc = new jsPDF();
  applyBrandFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFontSize(18);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Dnevnik rada'), margin, 18);

  doc.setFontSize(11);
  doc.setFont('Inter', 'normal');
  doc.text(toAscii(`Projekt: ${data.projectName}`), margin, 26);

  doc.setFontSize(9);
  doc.text(`${formatDate(data.fromDate)} - ${formatDate(data.toDate)}`, margin, 32);

  const sorted = [...data.entries].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));

  const rows = sorted.map(e => {
    const dateLabel = new Date(e.log_date + 'T00:00:00').toLocaleDateString('hr-HR');
    const weather = e.weather ? toAscii(e.weather) : '-';
    const milestone = e.milestone_name ? toAscii(e.milestone_name) : '-';
    const author = e.user_name ? toAscii(e.user_name) : '-';
    const hoursText = e.hours && e.hours.length > 0
      ? e.hours.map(h => `${toAscii(h.worker_name)} (${h.actual_hours.toFixed(1)}h)`).join(', ')
      : '-';
    const summary = toAscii(e.summary || '');
    const notes = e.notes ? toAscii(e.notes) : '';
    const combined = notes ? `${summary}\n\n${toAscii('Napomene')}: ${notes}` : summary;
    return [dateLabel, weather, milestone, author, hoursText, combined];
  });

  brandAutoTable(doc, {
    startY: 38,
    head: [['Datum', toAscii('Vrijeme'), 'Faza', 'Autor', 'Sati', toAscii('Sto je radjeno / Napomene')]],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: BRAND_TEAL, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2, valign: 'top' },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: 22 }, 2: { cellWidth: 25 },
      3: { cellWidth: 25 }, 4: { cellWidth: 32 }, 5: { cellWidth: 'auto' },
    },
    margin: { left: margin, right: margin },
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('Inter', 'normal');
    doc.text(`${i} / ${totalPages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }

  addNotOfficialFooter(doc);
  savePdf(doc, '04-project-worklog.pdf');
}

// ============================================================
// 05. Work Records (generateWorkRecordsPDF)
// ============================================================
function render05_workRecords() {
  const workers = [
    { id: 'w1', first_name: 'Tomislav', last_name: 'Horvat',    position: 'Stolar',       hourly_rate: 18, actualHoursTotal: 142.5, actualCostTotal: 2565 },
    { id: 'w2', first_name: 'Stipe',    last_name: 'Šaravanja', position: 'Električar',   hourly_rate: 16, actualHoursTotal: 98.0,  actualCostTotal: 1568 },
    { id: 'w3', first_name: 'Krešimir', last_name: 'Đikić',     position: 'Vodoinstalater', hourly_rate: 22, actualHoursTotal: 76.5, actualCostTotal: 1683 },
  ];
  const milestones = [
    { id: 'm1', name: 'Priprema' }, { id: 'm2', name: 'Temelji' },
    { id: 'm3', name: 'Instalacije' }, { id: 'm4', name: 'Završni radovi' },
  ];

  const entries = [];
  const days = ['2026-04-02', '2026-04-03', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-15', '2026-04-16', '2026-04-18', '2026-04-22', '2026-04-25', '2026-04-28', '2026-04-29'];
  let i = 0;
  for (const dateStr of days) {
    for (const w of workers) {
      const hrs = 6 + ((i + workers.indexOf(w)) % 4);
      entries.push({
        id: `e${i++}`,
        worker_id: w.id,
        work_date: dateStr,
        scheduled_hours: 8,
        actual_hours: hrs,
        note: hrs < 8 ? 'Ranije završeno' : (hrs > 8 ? 'Prekovremeni' : null),
        milestone_ids: [milestones[(i % 4)].id],
      });
    }
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  applyBrandFont(doc);
  const msMap = new Map(milestones.map(m => [m.id, m.name]));
  const wMap  = new Map(workers.map(w => [w.id, `${w.first_name} ${w.last_name}`.trim()]));

  let y = 15;
  doc.setFontSize(14);
  doc.text(`Radni sati — Adaptacija kuće Šibenik`, 15, y);
  y += 8;
  doc.setFontSize(9);
  doc.text(`Generirano: ${new Date().toLocaleString('hr-HR')}`, 15, y);
  y += 8;

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
    doc.text(formatCurrency(w.actualCostTotal), 190, y, { align: 'right' });
    y += 5;
  }

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

  savePdf(doc, '05-work-records.pdf');
}

// ============================================================
// 06. Spending Calendar — single day (exportDayPDF)
// ============================================================
function render06_spendingCalendarDay() {
  const dayTx = [
    { description: 'Konzum tjedna kupovina', merchant_name: 'Konzum Žitnjak', category: 'groceries', amount: 145.30, type: 'expense' },
    { description: 'Ručak — Bistro Šibenik', merchant_name: 'Bistro Šibenik', category: 'food',      amount: 38.50,  type: 'expense' },
    { description: 'Gorivo INA',             merchant_name: 'INA Đakovo',     category: 'car',       amount: 89.00,  type: 'expense' },
    { description: 'Honorar — Šimić d.o.o.', merchant_name: 'Šimić d.o.o.',   category: 'freelance', amount: 450.00, type: 'income' },
    { description: 'Bus karta ZET',          merchant_name: 'ZET',            category: 'transport', amount: 12.00,  type: 'expense' },
  ];
  const totalExpense = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome  = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const day = 28, month = 3 /* zero-based April */, year = 2026;
  const monthName = new Date(year, month, day).toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });

  const doc = new jsPDF();
  applyBrandFont(doc);
  doc.setFontSize(18);
  doc.setFont('Inter', 'bold');
  doc.text(toAscii('Kalendar potrosnje'), 14, 20);

  doc.setFontSize(12);
  doc.setFont('Inter', 'normal');
  doc.text(toAscii(`${day}. ${monthName}`), 14, 28);

  brandAutoTable(doc, {
    startY: 34,
    head: [[toAscii('Opis'), toAscii('Trgovac'), toAscii('Kategorija'), toAscii('Iznos')]],
    body: dayTx.map(tx => {
      const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';
      return [
        toAscii(tx.description),
        toAscii(tx.merchant_name || '-'),
        toAscii(getCategoryName(tx.category)),
        `${sign}${formatCurrency(tx.amount)}`,
      ];
    }),
    styles: { fontSize: 10 },
    headStyles: { fillColor: BRAND_TEAL },
    columnStyles: { 3: { halign: 'right' } },
  });

  const finalY = doc.lastAutoTable.finalY;
  let y = finalY + 10;

  doc.setFontSize(11);
  if (totalExpense > 0) {
    doc.setTextColor(220, 38, 38);
    doc.text(`${toAscii('Troskovi')}: -${formatCurrency(totalExpense)}`, 196, y, { align: 'right' });
    y += 6;
  }
  if (totalIncome > 0) {
    doc.setTextColor(22, 163, 74);
    doc.text(`${toAscii('Prihodi')}: +${formatCurrency(totalIncome)}`, 196, y, { align: 'right' });
    y += 6;
  }
  const net = totalIncome - totalExpense;
  doc.setTextColor(0, 0, 0);
  doc.setFont('Inter', 'bold');
  doc.text(`Neto: ${net >= 0 ? '+' : ''}${formatCurrency(net)}`, 196, y, { align: 'right' });

  savePdf(doc, '06-spending-calendar-day.pdf');
}

// ============================================================
// 07. Items Analysis (handleExportPDF iz ItemsAnalysisTab)
// ============================================================
function render07_itemsAnalysis() {
  const groups = [
    {
      categoryName: 'Namirnice',
      items: [
        { name: 'Mlijeko Z bregov 1L', quantity: 4, unit_price: 1.49,  total_price: 5.96, expenseDate: d(2026, 4, 28), expenseDescription: 'Konzum' },
        { name: 'Kruh polubijeli',     quantity: 3, unit_price: 1.20,  total_price: 3.60, expenseDate: d(2026, 4, 28), expenseDescription: 'Konzum' },
        { name: 'Banana 1kg',          quantity: 2, unit_price: 1.99,  total_price: 3.98, expenseDate: d(2026, 4, 28), expenseDescription: 'Konzum' },
        { name: 'Pileći file 500g',    quantity: 1, unit_price: 4.50,  total_price: 4.50, expenseDate: d(2026, 4, 28), expenseDescription: 'Konzum' },
        { name: 'Krumpir 2kg',         quantity: 1, unit_price: 2.20,  total_price: 2.20, expenseDate: d(2026, 4, 28), expenseDescription: 'Konzum' },
        { name: 'Jogurt voćni',        quantity: 6, unit_price: 0.80,  total_price: 4.80, expenseDate: d(2026, 4, 28), expenseDescription: 'Konzum' },
      ],
    },
    {
      categoryName: 'Hrana',
      items: [
        { name: 'Pizza Margherita',   quantity: 1, unit_price: 12.00, total_price: 12.00, expenseDate: d(2026, 4, 27), expenseDescription: 'Bistro Šibenik' },
        { name: 'Pivo Karlovačko',    quantity: 2, unit_price: 4.00,  total_price: 8.00,  expenseDate: d(2026, 4, 27), expenseDescription: 'Bistro Šibenik' },
        { name: 'Caffe latte',        quantity: 1, unit_price: 3.50,  total_price: 3.50,  expenseDate: d(2026, 4, 27), expenseDescription: 'Bistro Šibenik' },
      ],
    },
    {
      categoryName: 'Automobil',
      items: [
        { name: 'Eurosuper 95 (45L)',  quantity: 1, unit_price: 1.55, total_price: 69.75, expenseDate: d(2026, 4, 26), expenseDescription: 'INA Đakovo' },
        { name: 'Brisači — par',        quantity: 1, unit_price: 12.00, total_price: 12.00, expenseDate: d(2026, 4, 26), expenseDescription: 'INA Đakovo' },
        { name: 'Tekućina za pranje',   quantity: 1, unit_price: 5.00, total_price: 5.00, expenseDate: d(2026, 4, 26), expenseDescription: 'INA Đakovo' },
      ],
    },
  ];
  groups.forEach(g => {
    g.totalAmount = g.items.reduce((s, i) => s + i.total_price, 0);
    g.itemCount = g.items.length;
  });
  const totalItems = groups.reduce((s, g) => s + g.itemCount, 0);
  const totalAmount = groups.reduce((s, g) => s + g.totalAmount, 0);
  const dateRange = { start: d(2026, 4, 1), end: d(2026, 4, 30) };

  // NOTE: ItemsAnalysisTab NE prolazi tekst kroz toAscii — kategorije i imena
  // artikala idu izravno u jsPDF što znači da će dijakritici postati kvadratići.
  // Repliciram baš taj bug ovdje za QA.

  const doc = new jsPDF();
  applyBrandFont(doc);
  doc.setFont('Inter');
  doc.setFontSize(16);
  doc.text('Analiza troskova po artiklima', 14, 20);
  doc.setFontSize(10);
  doc.text(`Razdoblje: ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`, 14, 28);
  doc.text(`Ukupno artikala: ${totalItems} | Ukupni iznos: ${formatCurrency(totalAmount)}`, 14, 34);

  const tableData = [];
  groups.forEach(group => {
    group.items.forEach(item => {
      tableData.push([
        group.categoryName,
        item.name,
        String(item.quantity || 1),
        item.unit_price ? formatCurrency(item.unit_price) : '-',
        formatCurrency(item.total_price),
      ]);
    });
    tableData.push([
      { content: `Ukupno ${group.categoryName}`, styles: { fontStyle: 'bold', fillColor: BRAND_TEAL_LIGHT } },
      { content: '', styles: { fillColor: BRAND_TEAL_LIGHT } },
      { content: `${group.itemCount}`, styles: { fontStyle: 'bold', fillColor: BRAND_TEAL_LIGHT } },
      { content: '', styles: { fillColor: BRAND_TEAL_LIGHT } },
      { content: formatCurrency(group.totalAmount), styles: { fontStyle: 'bold', fillColor: BRAND_TEAL_LIGHT } },
    ]);
  });

  brandAutoTable(doc, {
    startY: 40,
    head: [['Kategorija', 'Artikl', 'Kol.', 'Jed. cijena', 'Ukupno']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND_TEAL },
  });

  const finalY = doc.lastAutoTable.finalY;
  doc.setFontSize(11);
  doc.setFont('Inter', 'bold');
  doc.text(`UKUPNO: ${formatCurrency(totalAmount)}`, 14, finalY + 10);

  savePdf(doc, '07-items-analysis.pdf');
}

// ============================================================
// 08. Business Report (exportPDF iz BusinessReports)
// ============================================================
function render08_businessReport() {
  const companyName = 'V&M Studio j.d.o.o.';
  const periodData = [
    { label: 'stu 2025',  income: 12400, expense: 8950,  profit: 3450,  count: 42 },
    { label: 'pro 2025',  income: 18200, expense: 11300, profit: 6900,  count: 51 },
    { label: 'sij 2026',  income: 9500,  expense: 7800,  profit: 1700,  count: 38 },
    { label: 'velj 2026', income: 14600, expense: 9200,  profit: 5400,  count: 45 },
    { label: 'ožu 2026',  income: 17800, expense: 12100, profit: 5700,  count: 56 },
    { label: 'tra 2026',  income: 21500, expense: 14400, profit: 7100,  count: 63 },
  ];
  const now = new Date(2026, 4, 16);
  const fmtDateTime = (d) => `${formatDate(d)} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;

  // NOTE: BusinessReports.tsx NE radi toAscii — sve hrvatske riječi idu direktno.
  // Repliciram identično za QA.

  const doc = new jsPDF();
  applyBrandFont(doc);
  doc.setFontSize(16);
  doc.text(`${companyName} — Poslovni izvještaj`, 14, 20);
  doc.setFontSize(10);
  doc.text(`Generirano: ${fmtDateTime(now)}`, 14, 28);
  doc.text(`Period: Mjesečno`, 14, 34);

  brandAutoTable(doc, {
    startY: 42,
    head: [['Period', 'Prihodi', 'Rashodi', 'Dobit', 'Br. transakcija']],
    body: periodData.map(p => [
      p.label,
      formatCurrency(p.income),
      formatCurrency(p.expense),
      formatCurrency(p.profit),
      p.count.toString(),
    ]),
  });

  savePdf(doc, '08-business-report.pdf');
}

// ============================================================
// 09. Work Log Monthly Overview (handleExportPdf iz WorkLogMonthlyOverview)
// ============================================================
function render09_workLogMonthly() {
  const projectName = 'Adaptacija kuće — Šibenik';
  const year = 2026, month = 3; // April (0-based)
  const days = [];
  for (let i = 1; i <= 30; i++) days.push(new Date(year, month, i));
  const monthLabel = days[0].toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const workers = [
    { id: 'w1', first_name: 'Tomislav', last_name: 'Horvat' },
    { id: 'w2', first_name: 'Stipe',    last_name: 'Šaravanja' },
    { id: 'w3', first_name: 'Krešimir', last_name: 'Đikić' },
    { id: 'w4', first_name: 'Marko',    last_name: 'Žužić' },
  ];

  // Generiraj sate: radnim danima ~7-9h, vikendima rijetko
  const grid = new Map();
  const workerTotals = new Map();
  let grandTotal = 0;
  for (const w of workers) {
    const dayMap = new Map();
    let total = 0;
    days.forEach((day, idx) => {
      const wkend = isWeekend(day);
      let h = 0;
      if (!wkend) {
        if ((idx + workers.indexOf(w)) % 5 !== 0) h = 6 + ((idx * 7 + workers.indexOf(w) * 3) % 4);
      } else if (idx % 11 === 0) {
        h = 4;
      }
      if (h > 0) dayMap.set(fmt(day), h);
      total += h;
    });
    grid.set(w.id, dayMap);
    workerTotals.set(w.id, total);
    grandTotal += total;
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  applyBrandFont(doc);

  doc.setFontSize(14);
  doc.text('Mjesečni pregled rada', 14, 15);
  doc.setFontSize(10);
  doc.text(`Projekt: ${projectName}`, 14, 22);
  doc.text(`Mjesec: ${monthLabel}`, 14, 28);

  const head = [['Radnik', ...days.map(d => format2(d)), 'Σ']];
  const body = workers.map(w => {
    const row = [`${w.first_name} ${w.last_name}`];
    const dayMap = grid.get(w.id);
    days.forEach(d => {
      const h = dayMap?.get(fmt(d)) || 0;
      row.push(h > 0 ? h.toFixed(1) : '');
    });
    row.push((workerTotals.get(w.id) || 0).toFixed(1));
    return row;
  });

  brandAutoTable(doc, {
    startY: 34,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: BRAND_TEAL },
    columnStyles: {
      0: { cellWidth: 36 },
      [days.length + 1]: { fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0 && data.column.index <= days.length) {
        const day = days[data.column.index - 1];
        if (isWeekend(day)) data.cell.styles.fillColor = [80, 80, 80];
      }
    },
  });

  const finalY = doc.lastAutoTable.finalY;
  doc.setFontSize(10);
  doc.text(`Sveukupno: ${grandTotal.toFixed(2)} h`, 14, finalY + 8);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('Interni dokument — nije službena evidencija radnog vremena.', 14, finalY + 14);

  savePdf(doc, '09-worklog-monthly.pdf');

  function format2(d) { return String(d.getDate()); }
}

// ============================================================
// 10a. AI Assistant — Table export (exportToPDF iz FinancialAssistantDialog)
// ============================================================
function render10a_aiAssistantTable() {
  const headers = ['Datum', 'Opis', 'Kategorija', 'Iznos', 'Plaćanje', 'Trgovac', 'Napomena'];
  const rows = expenses.slice(0, 18).map(e => [
    formatDate(e.date),
    e.description,
    getCategoryName(e.category),
    `${e.type === 'expense' ? '-' : '+'}${formatCurrency(e.amount)}`,
    PAYMENT_SOURCES[e.payment_source] || e.payment_source,
    '-',
    '-',
  ]);

  // NOTE: FinancialAssistantDialog NE radi toAscii — replicira se 1:1.

  const doc = new jsPDF({ orientation: rows[0]?.length > 5 ? 'landscape' : 'portrait' });
  applyBrandFont(doc);
  doc.setFont('Inter');
  doc.setFontSize(14);
  doc.text('V&M Balance - Izvoz podataka', 14, 15);
  doc.setFontSize(9);
  doc.text(`Datum: ${new Date().toLocaleDateString('hr-HR')}`, 14, 22);

  brandAutoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND_TEAL, textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  savePdf(doc, '10a-ai-assistant-table.pdf');
}

// ============================================================
// 10b. AI Assistant — Response export (exportResponseAsPDF)
// ============================================================
function render10b_aiAssistantResponse() {
  const content = `## Analiza tvojih troškova u travnju 2026

U travnju si potrošio **2 432,90 EUR** kroz 25 transakcija. Najveće stavke:

1. **Najam stana** — 420 EUR (17.3%)
2. **Nike tenisice** — 240 EUR (9.9%)
3. **Hrana i namirnice** — 220 EUR (9.0%)

### Što ide dobro
- Pridržavaš se budžeta za kategoriju "Zabava" (-15% vs ožujak)
- Štednja je porasla za 8% u odnosu na prosjek

### Što treba pratiti
- Kategorija "Kupovina" je 35% iznad prosjeka — provjeri impulzivne kupnje
- Pretplate (Netflix + Spotify) — razmisli o godišnjem planu

### Preporuka
Postavi tjedni limit za kategoriju "Hrana" na ~50 EUR i pratit ćeš preko aplikacije.

Sretno!`;

  const doc = new jsPDF();
  applyBrandFont(doc);
  doc.setFont('Inter');
  doc.setFontSize(14);
  doc.text('V&M Balance - AI Odgovor', 14, 15);
  doc.setFontSize(9);
  doc.text(`Datum: ${new Date().toLocaleDateString('hr-HR')}`, 14, 22);

  const cleanText = content
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`(.*?)`/g, '$1');

  const lines = doc.splitTextToSize(cleanText, 180);
  doc.setFontSize(10);
  doc.text(lines, 14, 30);

  savePdf(doc, '10b-ai-assistant-response.pdf');
}

// ============================================================
// Pokretanje
// ============================================================
console.log('Renderiranje PDF izvještaja → ' + OUT);
render01_financialExpenses();
render02_incomeReport();
render03_projectReport();
render04_projectWorkLog();
render05_workRecords();
render06_spendingCalendarDay();
render07_itemsAnalysis();
render08_businessReport();
render09_workLogMonthly();
render10a_aiAssistantTable();
render10b_aiAssistantResponse();
console.log('\nGotovo. Provjeri ' + OUT);
