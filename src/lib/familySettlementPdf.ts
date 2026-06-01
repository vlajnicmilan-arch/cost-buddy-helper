/**
 * Family settlement PDF — mjesečni obračun "tko kome duguje" za jednu obitelj.
 *
 * Sadržaj:
 *  - Header (group name, period) preko `pdfReportKit`
 *  - Summary tablica: član × shared_total × udio × paid × owed
 *  - Netting matrix: dugovnik → vjerovnik (pending vs paid badge)
 *  - Audit changes u periodu (last N)
 *
 * Interni izvještaj. NIJE službeni porezni dokument.
 */
import { loadJsPdf } from './loadJsPdf';
import { applyBrandFont, brandAutoTable, BRAND_DARK, BRAND_MUTED } from './pdfBranding';
import { drawReportHeader, drawReportFooter, REPORT_MARGIN_X } from './pdfReportKit';
import { addNotOfficialFooter } from './pdfFooter';
import { exportPDFDoc, type ExportMode } from './fileExport';
import i18n from '@/i18n';

export interface SettlementMemberRow {
  user_id: string;
  display_name: string;
  shared_total: number; // ukupni shared trošak grupe (po snapshotu)
  share_ratio: number; // 0..1
  owed: number;        // koliko član duguje u tom periodu
  paid: number;        // koliko je već uplatio
}

export interface SettlementRow {
  debtor: string;       // display name
  creditor: string;     // display name
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at?: string | null;
  note?: string | null;
}

export interface AuditEntryRow {
  actor_name: string;
  action: string;
  entity_type?: string | null;
  created_at: string;
}

export interface FamilySettlementPdfInput {
  groupName: string;
  periodStart: string; // ISO date
  periodEnd: string;
  currency: string;
  members: SettlementMemberRow[];
  settlements: SettlementRow[];
  auditEntries?: AuditEntryRow[];
  ownerName?: string;
  language?: 'hr' | 'en' | 'de';
  mode?: ExportMode;
}

const tr = (key: string, fallback: string, vars?: Record<string, any>) => {
  try {
    const v = i18n.t(key, { defaultValue: fallback, ...(vars || {}) });
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
};

const fmtMoney = (n: number, code: string, lang: string) => {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: code }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
};

const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`;

const fmtDate = (iso: string, lang: string) => {
  try {
    return new Intl.DateTimeFormat(lang, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export async function generateFamilySettlementPdf(
  input: FamilySettlementPdfInput,
): Promise<boolean> {
  const lang = input.language || (i18n.language as any) || 'hr';
  const { jsPDF } = await loadJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  applyBrandFont(doc);

  const periodLabel = `${fmtDate(input.periodStart, lang)} – ${fmtDate(input.periodEnd, lang)}`;
  let y = drawReportHeader(doc, {
    title: tr('family.split.settlements.exportPdf.title', 'Obiteljski obračun'),
    brand: {
      owner: input.ownerName || input.groupName,
      subtitle: `${input.groupName} · ${periodLabel}`,
      language: lang as any,
      confidentiality: 'internal',
    },
    confidentialityLabel: {
      internal: tr('reports.confidential.internal', 'Interno'),
      confidential: tr('reports.confidential.confidential', 'Povjerljivo'),
    },
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = REPORT_MARGIN_X;
  const contentWidth = pageWidth - margin * 2;

  // ----- Section 1: per-member summary -----
  doc.setFont('Inter', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
  doc.text(
    tr('family.split.settlements.exportPdf.sectionMembers', 'Pregled po članovima'),
    margin,
    y,
  );
  y += 4;

  const memberRows = input.members.map((m) => [
    m.display_name,
    fmtMoney(m.shared_total, input.currency, lang),
    fmtPct(m.share_ratio),
    fmtMoney(m.owed, input.currency, lang),
    fmtMoney(m.paid, input.currency, lang),
    fmtMoney(m.owed - m.paid, input.currency, lang),
  ]);

  brandAutoTable(doc, {
    startY: y,
    head: [[
      tr('family.split.settlements.exportPdf.colMember', 'Član'),
      tr('family.split.settlements.exportPdf.colSharedTotal', 'Ukupno dijeljeno'),
      tr('family.split.settlements.exportPdf.colShare', 'Udio'),
      tr('family.split.settlements.exportPdf.colOwed', 'Duguje'),
      tr('family.split.settlements.exportPdf.colPaid', 'Plaćeno'),
      tr('family.split.settlements.exportPdf.colBalance', 'Saldo'),
    ]],
    body: memberRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ----- Section 2: netting (who owes whom) -----
  doc.setFont('Inter', 'bold');
  doc.setFontSize(11);
  doc.text(
    tr('family.split.settlements.exportPdf.sectionNetting', 'Tko kome duguje'),
    margin,
    y,
  );
  y += 4;

  if (input.settlements.length === 0) {
    doc.setFont('Inter', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
    doc.text(
      tr(
        'family.split.settlements.exportPdf.nettingEmpty',
        'Nema otvorenih stavki — sve namireno.',
      ),
      margin,
      y,
    );
    y += 8;
  } else {
    brandAutoTable(doc, {
      startY: y,
      head: [[
        tr('family.split.settlements.exportPdf.colDebtor', 'Dugovnik'),
        tr('family.split.settlements.exportPdf.colCreditor', 'Vjerovnik'),
        tr('family.split.settlements.exportPdf.colAmount', 'Iznos'),
        tr('family.split.settlements.exportPdf.colStatus', 'Status'),
      ]],
      body: input.settlements.map((s) => [
        s.debtor,
        s.creditor,
        fmtMoney(s.amount, input.currency, lang),
        s.status === 'paid'
          ? tr('family.split.settlements.paid', 'Plaćeno')
          : s.status === 'cancelled'
            ? tr('family.split.settlements.exportPdf.statusCancelled', 'Otkazano')
            : tr('family.split.settlements.exportPdf.statusPending', 'Otvoreno'),
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ----- Section 3: audit (optional) -----
  const audit = input.auditEntries || [];
  if (audit.length > 0) {
    doc.setFont('Inter', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
    doc.text(
      tr('family.split.settlements.exportPdf.sectionAudit', 'Povijest promjena'),
      margin,
      y,
    );
    y += 4;

    brandAutoTable(doc, {
      startY: y,
      head: [[
        tr('family.split.settlements.exportPdf.colWhen', 'Vrijeme'),
        tr('family.split.settlements.exportPdf.colWho', 'Tko'),
        tr('family.split.settlements.exportPdf.colWhat', 'Akcija'),
      ]],
      body: audit.slice(0, 30).map((a) => [
        fmtDate(a.created_at, lang),
        a.actor_name || '—',
        tr(`family.split.audit.actions.${a.action}`, a.action),
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ----- Footer -----
  drawReportFooter(doc, {
    brand: { language: lang as any, confidentiality: 'internal' },
    pageLabel: tr('reports.pageLabel', 'Stranica {{n}} / {{total}}'),
    intendedForLabel: input.ownerName
      ? tr('reports.intendedFor', 'Namijenjeno: {{name}}', { name: input.ownerName })
      : undefined,
  });
  addNotOfficialFooter(doc);

  const fileName = buildFileName(input);
  return exportPDFDoc(doc, fileName, input.mode || 'save');
}

function buildFileName(input: FamilySettlementPdfInput): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  const period = `${input.periodStart}_${input.periodEnd}`;
  return `obracun-${slug(input.groupName)}-${period}.pdf`;
}
