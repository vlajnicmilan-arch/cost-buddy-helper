/**
 * Faza C3 — klijentski PDF izvještaj Krug settlementa.
 *
 * Konzistentno s ostatkom Centar izvještaja:
 *  - loadJsPdf (lazy) + pdfBranding (Inter UTF-8: č ć ž đ š)
 *  - pdfReportKit Variant B header + footer
 *  - brandAutoTable za tablice
 *  - exportPDFDoc (web/native jedinstveni izlaz)
 *
 * Nula HTTP izlaska, nula DB writea. Sve podatke proslijedi UI sloj.
 */
import i18n from '@/i18n';
import { loadJsPdf } from '@/lib/loadJsPdf';
import { exportPDFDoc, type ExportMode } from '@/lib/fileExport';
import { applyBrandFont, brandAutoTable, BRAND_MUTED, BRAND_DARK } from '@/lib/pdfBranding';
import { drawReportHeader, drawReportFooter, REPORT_MARGIN_X } from '@/lib/pdfReportKit';
import { ensureReportLogo } from '@/lib/reportLogo';
import {
  buildReportFileName,
  loadLastConfidentiality,
  type ReportBrandOptions,
} from '@/lib/reportDesign';
import { getReportOwner } from '@/hooks/useReportOwner';
import type { SettlementPreview } from '@/hooks/useKrugSettlement';
import type { KrugSettlementLedgerRow } from '@/hooks/useKrugSettlementMutations';
import type { OverrideHistoryRow } from '@/hooks/useKrugPeriodOverrides';

// ---------- Pure helpers (testable, no jsPDF) ----------

export const formatMoney = (n: number, currency: string, language: 'hr' | 'en' | 'de' = 'hr'): string => {
  const locale = language === 'en' ? 'en-GB' : language === 'de' ? 'de-DE' : 'hr-HR';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};

export const formatDate = (iso: string, language: 'hr' | 'en' | 'de' = 'hr'): string => {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = language === 'en' ? 'en-GB' : language === 'de' ? 'de-DE' : 'hr-HR';
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
};

export const formatPeriodLabel = (
  periodStart: string,
  periodEnd: string,
  language: 'hr' | 'en' | 'de' = 'hr',
): string => {
  const locale = language === 'en' ? 'en-GB' : language === 'de' ? 'de-DE' : 'hr-HR';
  try {
    const start = new Date(periodStart + 'T00:00:00Z');
    const end = new Date(periodEnd + 'T00:00:00Z');
    const sameMonth =
      start.getUTCFullYear() === end.getUTCFullYear() &&
      start.getUTCMonth() === end.getUTCMonth();
    if (sameMonth) {
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(start);
    }
    return `${formatDate(periodStart, language)} – ${formatDate(periodEnd, language)}`;
  } catch {
    return `${periodStart} – ${periodEnd}`;
  }
};

/** Groups override history by expense — one visual block per underlying expense. */
export const groupOverridesByExpense = (rows: OverrideHistoryRow[]): OverrideHistoryRow[][] => {
  const map = new Map<string, OverrideHistoryRow[]>();
  for (const r of rows) {
    const key = r.expense.id;
    const bucket = map.get(key) ?? [];
    bucket.push(r);
    map.set(key, bucket);
  }
  // Within a group, newest proposal first.
  for (const bucket of map.values()) {
    bucket.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  // Buckets sorted by newest expense date first.
  return Array.from(map.values()).sort((a, b) =>
    a[0].expense.date < b[0].expense.date ? 1 : -1,
  );
};

// ---------- Main export ----------

export interface KrugSettlementPdfInput {
  krugName: string;
  periodStart: string; // YYYY-MM-DD (inclusive)
  periodEnd: string;   // YYYY-MM-DD (inclusive)
  language?: 'hr' | 'en' | 'de';
  preview: SettlementPreview;
  ledger: KrugSettlementLedgerRow[];
  overrides: OverrideHistoryRow[];
  /** UID → localized display name */
  nameFor: (uid: string) => string;
  mode?: ExportMode;
  brand?: ReportBrandOptions;
}

const t = (key: string, fallback: string, vars?: Record<string, string | number>) =>
  i18n.t(key, { defaultValue: fallback, ...(vars ?? {}) }) as string;

const resolveBrand = async (
  krugName: string,
  periodLabel: string,
  brand: ReportBrandOptions = {},
): Promise<ReportBrandOptions> => {
  const language = (brand.language || (i18n.language as any) || 'hr') as 'hr' | 'en' | 'de';
  const owner = brand.owner ?? (await getReportOwner());
  const confidentiality = brand.confidentiality ?? loadLastConfidentiality();
  const subtitle = brand.subtitle || `${krugName} · ${periodLabel}`;
  return { owner, language, confidentiality, subtitle };
};

const confidentialityLabel = () => ({
  internal: i18n.t('reportBranding.confidentiality.internal') as string,
  confidential: i18n.t('reportBranding.confidentiality.confidential') as string,
});

const drawFooter = (doc: any, fullBrand: ReportBrandOptions) => {
  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: i18n.t('reportBranding.pageXofY') as string,
    intendedForLabel:
      fullBrand.confidentiality !== 'none' && fullBrand.owner
        ? `${i18n.t('reportBranding.intendedFor') as string}: ${fullBrand.owner}`
        : undefined,
  });
};

const sectionTitle = (doc: any, y: number, label: string): number => {
  doc.setFont('Inter', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
  doc.text(label, REPORT_MARGIN_X, y);
  return y + 3;
};

const infoLine = (doc: any, y: number, text: string): number => {
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
  doc.text(text, REPORT_MARGIN_X, y);
  return y + 4.5;
};

/** Ensures at least `needed` mm remain on the page; adds a new one if not. */
const ensureSpace = (doc: any, y: number, needed: number, fullBrand: ReportBrandOptions): number => {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 18) {
    doc.addPage();
    applyBrandFont(doc);
    // Body starts a little below the top margin on subsequent pages.
    return 18;
  }
  return y;
};

export const exportKrugSettlementPdf = async (
  input: KrugSettlementPdfInput,
): Promise<boolean> => {
  const {
    krugName, periodStart, periodEnd, preview, ledger, overrides, nameFor,
    mode = 'save', brand = {},
  } = input;
  const language = (input.language || brand.language || (i18n.language as any) || 'hr') as
    'hr' | 'en' | 'de';

  const { jsPDF, autoTable } = await loadJsPdf();
  await ensureReportLogo();
  const doc = new jsPDF();
  applyBrandFont(doc);

  const periodLabel = formatPeriodLabel(periodStart, periodEnd, language);
  const fullBrand = await resolveBrand(krugName, periodLabel, { ...brand, language });

  const bodyStartY = drawReportHeader(doc, {
    title: t('krug.settlement.pdf.title', 'Tko kome — izvještaj'),
    brand: fullBrand,
    confidentialityLabel: confidentialityLabel(),
  });

  let y = bodyStartY;

  // -------- Meta strip --------
  const fxSource = preview.fx?.source || '—';
  const fxDate = preview.fx?.snapshot_date || '—';
  const fxFrozen = (preview.fx as any)?.frozen === true;
  const splitMode = t(
    `krug.settlement.splitMode.${preview.split_mode}`,
    preview.split_mode,
  );

  const metaBody = [
    [t('krug.settlement.displayCurrency', 'Valuta'), preview.display_currency],
    [t('krug.settlement.pdf.splitModeLabel', 'Način podjele'), splitMode],
    [t('krug.settlement.pdf.fxSource', 'FX izvor'), fxSource],
    [t('krug.settlement.pdf.fxSnapshotDate', 'FX datum snapshota'), fxDate],
    [
      t('krug.settlement.pdf.fxStatus', 'FX status'),
      fxFrozen
        ? t('krug.settlement.pdf.fxFrozen', 'Zamrznut (mjesečni snapshot)')
        : t('krug.settlement.pdf.fxLive', 'Uživo'),
    ],
  ];

  brandAutoTable(doc, autoTable, {
    startY: y,
    head: [[t('krug.settlement.pdf.metaLabel', 'Stavka'), t('krug.settlement.pdf.metaValue', 'Vrijednost')]],
    body: metaBody,
    margin: { left: REPORT_MARGIN_X },
    tableWidth: 170,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Warning flags
  const flags: string[] = [];
  if (preview.flags?.mixed_currencies) {
    flags.push(t('krug.settlement.pdf.flags.mixedCurrencies', 'Više valuta — primijenjena FX konverzija.'));
  }
  if (preview.flags?.manual_mode_fallback_equal) {
    flags.push(t('krug.settlement.pdf.flags.manualFallback', 'Manual mod: fallback na jednake udjele.'));
  }
  if (preview.flags?.missing_income_data) {
    flags.push(t('krug.settlement.pdf.flags.missingIncome', 'Nedostaju omjeri prihoda — korišteni jednaki udjeli.'));
  }
  for (const f of flags) {
    y = ensureSpace(doc, y, 6, fullBrand);
    y = infoLine(doc, y, `• ${f}`);
  }
  if (flags.length > 0) y += 2;

  // -------- Members --------
  y = ensureSpace(doc, y, 14, fullBrand);
  y = sectionTitle(doc, y, t('krug.settlement.pdf.membersHeader', 'Članovi Kruga'));
  const membersSorted = [...(preview.members ?? [])].sort((a, b) =>
    nameFor(a.user_id).localeCompare(nameFor(b.user_id)),
  );
  if (membersSorted.length === 0) {
    y = infoLine(doc, y + 2, t('krug.settlement.empty', 'Nema potvrđenih zajedničkih troškova u ovom periodu.'));
  } else {
    brandAutoTable(doc, autoTable, {
      startY: y,
      head: [[
        t('krug.settlement.pdf.col.member', 'Član'),
        t('krug.settlement.paid', 'Platio'),
        t('krug.settlement.owed', 'Duguje'),
        t('krug.settlement.net', 'Neto'),
      ]],
      body: membersSorted.map((m) => [
        nameFor(m.user_id),
        formatMoney(m.paid, preview.display_currency, language),
        formatMoney(m.owed, preview.display_currency, language),
        formatMoney(m.net, preview.display_currency, language),
      ]),
      margin: { left: REPORT_MARGIN_X },
      tableWidth: 170,
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // -------- Transfers --------
  y = ensureSpace(doc, y, 14, fullBrand);
  y = sectionTitle(doc, y, t('krug.settlement.pdf.transfersHeader', 'Predloženi transferi'));
  const transfers = preview.transfers ?? [];
  if (transfers.length === 0) {
    y = infoLine(doc, y + 2, t('krug.settlement.pdf.balanced', 'Nema otvorenih transfera — Krug je u ravnoteži.'));
  } else {
    brandAutoTable(doc, autoTable, {
      startY: y,
      head: [[
        t('krug.settlement.pdf.col.from', 'Od'),
        t('krug.settlement.pdf.col.to', 'Prima'),
        t('krug.settlement.pdf.col.amount', 'Iznos'),
        t('krug.settlement.pdf.col.currency', 'Valuta'),
      ]],
      body: transfers.map((tr) => [
        nameFor(tr.from_user),
        nameFor(tr.to_user),
        formatMoney(tr.amount, tr.currency, language),
        tr.currency,
      ]),
      margin: { left: REPORT_MARGIN_X },
      tableWidth: 170,
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'center', cellWidth: 22 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // -------- Timeline (ledger) --------
  const ledgerSorted = [...ledger].sort((a, b) => (a.marked_at < b.marked_at ? -1 : 1));
  if (ledgerSorted.length > 0) {
    y = ensureSpace(doc, y, 14, fullBrand);
    y = sectionTitle(doc, y, t('krug.settlement.pdf.timelineHeader', 'Timeline podmirenja'));
    brandAutoTable(doc, autoTable, {
      startY: y,
      head: [[
        t('krug.settlement.pdf.col.date', 'Datum'),
        t('krug.settlement.pdf.col.from', 'Od'),
        t('krug.settlement.pdf.col.to', 'Prima'),
        t('krug.settlement.pdf.col.amount', 'Iznos'),
        t('krug.settlement.pdf.col.status', 'Status'),
      ]],
      body: ledgerSorted.map((r) => {
        const voided = !!r.voided_at;
        const status = voided
          ? `${t('krug.settlement.pdf.status.voided', 'Poništeno')}${r.void_reason ? ` — ${r.void_reason}` : ''}`
          : t('krug.settlement.pdf.status.settled', 'Podmireno');
        const noteSuffix = r.note ? ` · ${r.note}` : '';
        return [
          formatDate(r.marked_at, language),
          nameFor(r.from_user) + noteSuffix,
          nameFor(r.to_user),
          `${formatMoney(Number(r.amount), r.currency, language)}`,
          status,
        ];
      }),
      margin: { left: REPORT_MARGIN_X },
      tableWidth: 170,
      columnStyles: {
        3: { halign: 'right' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // -------- Override governance history --------
  y = ensureSpace(doc, y, 14, fullBrand);
  y = sectionTitle(doc, y, t('krug.settlement.pdf.overridesHeader', 'Povijest ručnih podjela'));

  const groups = groupOverridesByExpense(overrides);
  if (groups.length === 0) {
    y = infoLine(doc, y + 2, t('krug.settlement.pdf.overridesNone', 'Nema ručnih podjela u ovom periodu.'));
  } else {
    for (const bucket of groups) {
      const head = bucket[0];
      // Expense sub-header
      y = ensureSpace(doc, y, 22, fullBrand);
      doc.setFont('Inter', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
      const desc = head.expense.description?.trim() || t('krug.settlement.pdf.expenseNoDesc', '(bez opisa)');
      doc.text(
        `${formatDate(head.expense.date, language)} · ${desc} · ${formatMoney(head.expense.amount, head.expense.currency, language)}`,
        REPORT_MARGIN_X,
        y,
      );
      y += 4;

      // Each proposal for this expense
      for (const row of bucket) {
        const statusLabel = t(
          `krug.settlement.pdf.overrideStatus.${row.status}`,
          row.status,
        );
        y = ensureSpace(doc, y, 20, fullBrand);
        y = infoLine(
          doc,
          y,
          `${t('krug.settlement.pdf.proposedBy', 'Predložio')}: ${nameFor(row.proposed_by)} · ${formatDate(row.created_at, language)} · ${t('krug.settlement.pdf.statusLabel', 'Status')}: ${statusLabel}${row.reject_reason ? ` — ${row.reject_reason}` : ''}`,
        );

        // Shares table (compact)
        if (row.shares.length > 0) {
          brandAutoTable(doc, autoTable, {
            startY: y,
            head: [[
              t('krug.settlement.pdf.col.member', 'Član'),
              t('krug.settlement.pdf.col.share', 'Udio %'),
            ]],
            body: row.shares
              .slice()
              .sort((a, b) => b.share_percent - a.share_percent)
              .map((s) => [nameFor(s.user_id), `${s.share_percent.toFixed(2)} %`]),
            margin: { left: REPORT_MARGIN_X + 4 },
            tableWidth: 120,
            styles: { fontSize: 8.5, cellPadding: { top: 3, right: 4, bottom: 3, left: 4 } },
            columnStyles: {
              1: { halign: 'right', cellWidth: 30 },
            },
          });
          y = (doc as any).lastAutoTable.finalY + 3;
        }

        // Confirmations
        if (row.confirmations.length > 0) {
          const cText =
            `${t('krug.settlement.pdf.confirmedBy', 'Potvrdili')}: ` +
            row.confirmations
              .map((c) => `${nameFor(c.user_id)} (${formatDate(c.confirmed_at, language)})`)
              .join(', ');
          // Wrap long confirmation lines to page width.
          const pageWidth = doc.internal.pageSize.getWidth();
          const maxWidth = pageWidth - REPORT_MARGIN_X * 2 - 4;
          const wrapped = doc.splitTextToSize(cText, maxWidth);
          for (const line of wrapped) {
            y = ensureSpace(doc, y, 5, fullBrand);
            y = infoLine(doc, y, line);
          }
        } else {
          y = infoLine(
            doc,
            y,
            t('krug.settlement.pdf.confirmedNone', 'Potvrde: —'),
          );
        }
        y += 3;
      }
      y += 2;
    }
  }

  drawFooter(doc, fullBrand);

  const period = periodStart.slice(0, 7); // YYYY-MM
  const fileName = buildReportFileName({
    type: t('krug.settlement.pdf.filenameBase', 'krug-settlement') + `-${krugName}`,
    owner: fullBrand.owner,
    period,
    ext: 'pdf',
  });
  return exportPDFDoc(doc, fileName, mode);
};
