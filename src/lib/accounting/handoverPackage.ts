/**
 * Predaja knjigovođi — odabir troškova, grupiranje i zbrojevi.
 *
 * Paket sadrži ISKLJUČIVO fotografirane/skenirane poslovne račune
 * (troškovi sa slikom). eRačun i mail-PDF knjigovođa već ima, pa ulazni
 * računi ne ulaze u predaju.
 *
 * Sve funkcije su čiste (bez mreže i okoline).
 */
import { isPersonalSourceForProfile } from '@/lib/receiptBusinessRouting';

export type AccountingCategory = 'project' | 'tool' | 'fixed_asset';

export const ACCOUNTING_CATEGORIES: readonly AccountingCategory[] = [
  'project',
  'tool',
  'fixed_asset',
];

export const isAccountingCategory = (value: unknown): value is AccountingCategory =>
  typeof value === 'string' && (ACCOUNTING_CATEGORIES as readonly string[]).includes(value);

/** Trošak u opsegu paketa — polja koja odabir i izvoz stvarno čitaju. */
export interface HandoverExpenseLike {
  id: string;
  type?: string | null;
  merchant_name?: string | null;
  description?: string | null;
  date?: string | null;
  amount?: number | null;
  currency?: string | null;
  vat_amount?: number | null;
  vat_rate?: number | null;
  payment_source?: string | null;
  category?: string | null;
  receipt_url?: string | null;
  deleted_at?: string | null;
  invoice_id?: string | null;
  business_profile_id?: string | null;
  project_id?: string | null;
  owner_funding_choice?: string | null;
  accounting_category?: string | null;
}

export interface HandoverProjectLite {
  id: string;
  name?: string | null;
  business_profile_id?: string | null;
}

export interface HandoverPaymentSourceLite {
  id: string;
  name?: string | null;
  business_profile_id?: string | null;
}

/**
 * Poslovni trošak za odabranu tvrtku: vezan na tvrtku, na projekt te tvrtke,
 * ili ga je vlasnik platio za firmu (`owner_funding_choice` popunjen).
 */
export const isBusinessExpenseForProfile = (
  expense: HandoverExpenseLike,
  projects: readonly HandoverProjectLite[],
  businessProfileId: string,
): boolean => {
  if (expense.business_profile_id === businessProfileId) return true;
  if (expense.project_id) {
    const project = projects.find((p) => p.id === expense.project_id);
    if (project?.business_profile_id === businessProfileId) return true;
  }
  if (expense.owner_funding_choice) return true;
  return false;
};

/**
 * Trošak ulazi u paket kad vrijedi SVE: rashod, nije obrisan, nije vezan na
 * eRačun (`invoice_id`), ima sliku/skan (`receipt_url`) i poslovni je za
 * odabranu tvrtku. Razdoblje se provjerava zasebno po datumu troška.
 */
export const isHandoverExpense = (
  expense: HandoverExpenseLike,
  projects: readonly HandoverProjectLite[],
  businessProfileId: string,
): boolean => {
  if (expense.type !== 'expense') return false;
  if (expense.deleted_at) return false;
  if (expense.invoice_id) return false;
  if (!expense.receipt_url) return false;
  return isBusinessExpenseForProfile(expense, projects, businessProfileId);
};

/** `YYYY-MM` razdoblja iz datuma troška. */
export const expensePeriod = (expense: HandoverExpenseLike): string | null => {
  const date = expense.date?.slice(0, 7);
  return date && /^\d{4}-\d{2}$/.test(date) ? date : null;
};

export interface HandoverSelectionInput {
  expenses: readonly HandoverExpenseLike[];
  projects: readonly HandoverProjectLite[];
  businessProfileId: string;
  /** `YYYY-MM`. */
  period: string;
}

export interface HandoverSelection {
  /** Troškovi koji ulaze u paket. */
  included: HandoverExpenseLike[];
  /** Poslovni troškovi sa slikom, ali bez datuma — „bez datuma — provjeri". */
  missingDate: HandoverExpenseLike[];
}

/**
 * Troškovi za predaju: slika + poslovnost + razdoblje po DATUMU troška
 * (plaćanje je nebitno). Trošak bez datuma ne ulazi u zbrojeve, nego u
 * zaseban popis za provjeru.
 */
export const selectHandoverExpenses = (input: HandoverSelectionInput): HandoverSelection => {
  const included: HandoverExpenseLike[] = [];
  const missingDate: HandoverExpenseLike[] = [];
  for (const expense of input.expenses) {
    if (!isHandoverExpense(expense, input.projects, input.businessProfileId)) continue;
    const period = expensePeriod(expense);
    if (!period) {
      missingDate.push(expense);
      continue;
    }
    if (period === input.period) included.push(expense);
  }
  return { included, missingDate };
};

// --- Kategorija ---

/**
 * Knjigovodstvena kategorija troška: spremljena vrijednost ima prednost;
 * inače se izvodi — trošak s projektom je „pripadnost projektu".
 */
export const resolveExpenseAccountingCategory = (
  expense: HandoverExpenseLike,
): AccountingCategory | 'unset' => {
  if (isAccountingCategory(expense.accounting_category)) return expense.accounting_category;
  return expense.project_id ? 'project' : 'unset';
};

// --- „Materijalni trošak" (izvedeno, ne sprema se) ---

const CUSTOM_SOURCE_PREFIX = 'custom:';

const extractCustomSourceId = (paymentSource: string | null | undefined): string | null => {
  if (!paymentSource) return null;
  return paymentSource.startsWith(CUSTOM_SOURCE_PREFIX)
    ? paymentSource.slice(CUSTOM_SOURCE_PREFIX.length)
    : null;
};

export interface MaterialExpenseFlagInput {
  expense: HandoverExpenseLike;
  sources: readonly HandoverPaymentSourceLite[];
  businessProfileId: string;
}

/**
 * „Materijalni trošak" — vlasnik je platio poslovni trošak iz privatnog
 * izvora. `owner_funding_choice = 'material'` → da; `'owner_loan'` → ne
 * (to je pozajmica); prazno → gleda se izvor plaćanja (gotovina ili
 * privatna kartica uz poslovni trošak → da). Ne sprema se.
 */
export const deriveMaterialExpenseFlag = (input: MaterialExpenseFlagInput): boolean => {
  const { expense, sources, businessProfileId } = input;
  if (expense.owner_funding_choice === 'material') return true;
  if (expense.owner_funding_choice) return false;

  const paymentSource = expense.payment_source;
  if (!paymentSource) return false;
  // Gotovina je uvijek privatni izvor — firma nema gotovinski račun u aplikaciji.
  if (paymentSource === 'cash') return true;

  const customSourceId = extractCustomSourceId(paymentSource);
  if (!customSourceId) return false;
  return isPersonalSourceForProfile({
    customPaymentSourceId: customSourceId,
    sources,
    targetBusinessProfileId: businessProfileId,
  });
};

// --- PDV po stopama ---

export interface VatRateRow {
  /** Stopa u postotcima; `null` = „nerazvrstano". */
  rate: number | null;
  base: number;
  vat: number;
  total: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Rekapitulacija PDV-a po stopama iz `vat_rate`/`vat_amount`. Trošak bez
 * PDV podataka ide u „nerazvrstano" (`rate: null`).
 */
export const vatRecap = (expenses: readonly HandoverExpenseLike[]): VatRateRow[] => {
  const byRate = new Map<string, VatRateRow>();
  const add = (rate: number | null, base: number, vat: number) => {
    const key = rate === null ? 'null' : String(rate);
    const row = byRate.get(key) ?? { rate, base: 0, vat: 0, total: 0 };
    row.base += base;
    row.vat += vat;
    row.total += base + vat;
    byRate.set(key, row);
  };

  for (const expense of expenses) {
    const total = Number(expense.amount ?? 0);
    const vat = Number(expense.vat_amount ?? 0);
    const rate = Number.isFinite(Number(expense.vat_rate)) && expense.vat_rate != null
      ? Number(expense.vat_rate)
      : null;
    add(rate, total - vat, vat);
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
  expenses: HandoverExpenseLike[];
  total: number;
  vat: number;
}

/** Grupirano po kategoriji; unutar „pripadnost projektu" još po projektu. */
export const groupHandoverExpenses = (
  expenses: readonly HandoverExpenseLike[],
): HandoverGroup[] => {
  const groups = new Map<string, HandoverGroup>();
  for (const expense of expenses) {
    const category = resolveExpenseAccountingCategory(expense);
    const key = category === 'project' ? `project:${expense.project_id ?? ''}` : category;
    const group = groups.get(key) ?? {
      kind: category,
      projectId: category === 'project' ? expense.project_id ?? null : null,
      expenses: [],
      total: 0,
      vat: 0,
    };
    group.expenses.push(expense);
    group.total += Number(expense.amount ?? 0);
    group.vat += Number(expense.vat_amount ?? 0);
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

export const packageTotals = (expenses: readonly HandoverExpenseLike[]): HandoverTotals => {
  let total = 0;
  let vat = 0;
  for (const expense of expenses) {
    total += Number(expense.amount ?? 0);
    vat += Number(expense.vat_amount ?? 0);
  }
  return {
    count: expenses.length,
    base: round2(total - vat),
    vat: round2(vat),
    total: round2(total),
  };
};
