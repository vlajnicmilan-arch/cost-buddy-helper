/**
 * B — Mjesečni paket za knjigovođu: odabir računa, grupiranje i zbrojevi.
 *
 * Sve funkcije su čiste (bez mreže i okoline). Pravila F1/F2 se samo ČITAJU
 * kroz `isAccountingHandoverInvoice` — logika kategorije i oznake
 * „materijalni trošak" se ovdje ne mijenja.
 */
import {
  isAccountingHandoverInvoice,
  resolveInvoiceBusinessProfileId,
  type AccountingCategory,
  type AccountingProfileLite,
  type ProjectLite,
} from './accountingClassification';

/** Račun u opsegu paketa — polja koja izvoz stvarno čita. */
export interface HandoverInvoiceLike {
  id: string;
  supplier_name?: string | null;
  supplier_oib?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total_amount?: number | null;
  vat_amount?: number | null;
  currency?: string | null;
  items?: unknown;
  business_profile_id?: string | null;
  project_id?: string | null;
  paid_at?: string | null;
  paid_expense_id?: string | null;
  accounting_category?: string | null;
  import_batch_id?: string | null;
  source_filename?: string | null;
}

/**
 * Podrijetlo službenog eRačun/FINA kanala — takve račune knjigovođa već ima,
 * pa ne ulaze u paket. Serije eRačun uvoza jedine pune `import_batch_id`
 * (i `source_filename` s nastavkom `.xml`).
 */
export const isFinaOriginInvoice = (invoice: HandoverInvoiceLike): boolean => {
  if (invoice.import_batch_id) return true;
  const file = invoice.source_filename?.trim().toLowerCase();
  return !!file && file.endsWith('.xml');
};

/** `YYYY-MM` razdoblja iz datuma računa (`issue_date`). */
export const invoicePeriod = (invoice: HandoverInvoiceLike): string | null => {
  const date = invoice.issue_date?.slice(0, 7);
  return date && /^\d{4}-\d{2}$/.test(date) ? date : null;
};

export interface HandoverSelectionInput {
  invoices: readonly HandoverInvoiceLike[];
  projects: readonly ProjectLite[];
  profiles: readonly AccountingProfileLite[];
  businessProfileId: string;
  /** `YYYY-MM`. */
  period: string;
}

export interface HandoverSelection {
  /** Računi koji ulaze u paket. */
  included: HandoverInvoiceLike[];
  /** Za predaju, ali bez datuma računa — „bez datuma — provjeri". */
  missingDate: HandoverInvoiceLike[];
}

const inScope = (
  invoice: HandoverInvoiceLike,
  input: HandoverSelectionInput,
): boolean => {
  if (!isAccountingHandoverInvoice(invoice, input.projects, input.profiles)) return false;
  if (resolveInvoiceBusinessProfileId(invoice, input.projects) !== input.businessProfileId) {
    return false;
  }
  return !isFinaOriginInvoice(invoice);
};

/**
 * Računi za predaju: pravilo F2 + mjerodavna tvrtka + razdoblje po DATUMU
 * RAČUNA (plaćanje je nebitno) + nije FINA podrijetlo. Račun bez datuma ne
 * ulazi u zbrojeve, nego u zaseban popis za provjeru.
 */
export const selectHandoverInvoices = (input: HandoverSelectionInput): HandoverSelection => {
  const included: HandoverInvoiceLike[] = [];
  const missingDate: HandoverInvoiceLike[] = [];
  for (const invoice of input.invoices) {
    if (!inScope(invoice, input)) continue;
    const period = invoicePeriod(invoice);
    if (!period) {
      missingDate.push(invoice);
      continue;
    }
    if (period === input.period) included.push(invoice);
  }
  return { included, missingDate };
};

// --- PDV po stopama ---

export interface VatRateRow {
  /** Stopa u postotcima; `null` = „nerazvrstano" (nema stavki). */
  rate: number | null;
  base: number;
  vat: number;
  total: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface LineLike {
  lineAmount?: unknown;
  vatPercent?: unknown;
}

const readLines = (invoice: HandoverInvoiceLike): LineLike[] =>
  Array.isArray(invoice.items) ? (invoice.items as LineLike[]) : [];

/**
 * Rekapitulacija PDV-a po stopama iz `items[].vatPercent`. Kad račun nema
 * stavki, cijeli iznos ide u „nerazvrstano" (`rate: null`) iz `total_amount`
 * i `vat_amount`.
 */
export const vatRecap = (invoices: readonly HandoverInvoiceLike[]): VatRateRow[] => {
  const byRate = new Map<string, VatRateRow>();
  const add = (rate: number | null, base: number, vat: number) => {
    const key = rate === null ? 'null' : String(rate);
    const row = byRate.get(key) ?? { rate, base: 0, vat: 0, total: 0 };
    row.base += base;
    row.vat += vat;
    row.total += base + vat;
    byRate.set(key, row);
  };

  for (const invoice of invoices) {
    const lines = readLines(invoice);
    const usable = lines.filter((l) => Number.isFinite(Number(l?.lineAmount)));
    if (usable.length === 0) {
      const total = Number(invoice.total_amount ?? 0);
      const vat = Number(invoice.vat_amount ?? 0);
      add(null, total - vat, vat);
      continue;
    }
    for (const line of usable) {
      const base = Number(line.lineAmount);
      const rate = Number.isFinite(Number(line.vatPercent)) ? Number(line.vatPercent) : null;
      add(rate, base, rate === null ? 0 : round2((base * rate) / 100));
    }
  }

  return Array.from(byRate.values())
    .map((r) => ({ rate: r.rate, base: round2(r.base), vat: round2(r.vat), total: round2(r.total) }))
    .sort((a, b) => (a.rate ?? -1) - (b.rate ?? -1));
};

// --- Grupiranje ---

export type HandoverGroupKind = AccountingCategory | 'unset';

export interface HandoverGroup {
  kind: HandoverGroupKind;
  /** Popunjeno samo za „pripadnost projektu". */
  projectId: string | null;
  invoices: HandoverInvoiceLike[];
  total: number;
  vat: number;
}

const groupKey = (invoice: HandoverInvoiceLike): string => {
  const category = invoice.accounting_category ?? 'unset';
  return category === 'project' ? `project:${invoice.project_id ?? ''}` : category;
};

/** Grupirano po kategoriji; unutar „pripadnost projektu" još po projektu. */
export const groupHandoverInvoices = (
  invoices: readonly HandoverInvoiceLike[],
): HandoverGroup[] => {
  const groups = new Map<string, HandoverGroup>();
  for (const invoice of invoices) {
    const key = groupKey(invoice);
    const category = (invoice.accounting_category ?? 'unset') as HandoverGroupKind;
    const group = groups.get(key) ?? {
      kind: category,
      projectId: category === 'project' ? invoice.project_id ?? null : null,
      invoices: [],
      total: 0,
      vat: 0,
    };
    group.invoices.push(invoice);
    group.total += Number(invoice.total_amount ?? 0);
    group.vat += Number(invoice.vat_amount ?? 0);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((g) => ({
    ...g,
    total: round2(g.total),
    vat: round2(g.vat),
  }));
};

export interface HandoverTotals {
  count: number;
  base: number;
  vat: number;
  total: number;
}

export const packageTotals = (invoices: readonly HandoverInvoiceLike[]): HandoverTotals => {
  let total = 0;
  let vat = 0;
  for (const invoice of invoices) {
    total += Number(invoice.total_amount ?? 0);
    vat += Number(invoice.vat_amount ?? 0);
  }
  return {
    count: invoices.length,
    base: round2(total - vat),
    vat: round2(vat),
    total: round2(total),
  };
};
