/**
 * Obrada — „Mjesečni pogled: gdje curi" (Temelj, korak 4).
 * Čisti helperi bez Reacta; rade nad redcima oblika `Expense`.
 * Sve brojke idu kroz isRealSpend/isRealIncome, samo osobni redci
 * (bez project_id i business_profile_id), deleted_at null.
 */
import { isExpenseType, isRealIncome, isRealSpend } from '@/lib/spendClassification';
import { categoryGroupLabelKey, resolveTreeCategory, type CategoryGroupKey } from '@/lib/categoryTree';
import { normalizeMerchant } from '@/lib/duplicateDetection';

/** Pragovi rasta „gdje curi" — vlasnik ih mijenja ovdje, na jednom mjestu. */
export const GROWTH_MIN_RATIO = 1.25; // rast >= 25% prema prosjeku
export const GROWTH_MIN_DELTA = 20; // i barem 20 (valuta zapisa) iznad prosjeka

/** Ponavljajući trgovac: prisutan u barem ovoliko od zadnja 4 mjeseca. */
export const RECURRING_MIN_MONTHS = 3;
export const RECURRING_WINDOW_MONTHS = 4;

export interface ObradaRow {
  amount: number;
  type?: string | null;
  date: Date | string;
  category?: string | null;
  description?: string | null;
  merchant_name?: string | null;
  counterparty_name_snapshot?: string | null;
  expense_nature?: string | null;
  movement_kind?: string | null;
  deleted_at?: string | Date | null;
  project_id?: string | null;
  business_profile_id?: string | null;
  tags?: string[] | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

/** Ključ mjeseca „YYYY-MM" u lokalnom vremenu. */
export const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const monthKeyOf = (ref: Date): string => monthKey(ref);

/** Ključevi zadnjih N mjeseci uključujući mjesec od ref, od najstarijeg. */
export function lastMonthKeys(ref: Date, n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(ref.getFullYear(), ref.getMonth() - i, 1)));
  }
  return keys;
}

const isPersonal = (r: ObradaRow): boolean => !r.project_id && !r.business_profile_id;

const isLive = (r: ObradaRow): boolean => r.deleted_at == null;

const inMonth = (r: ObradaRow, key: string): boolean => monthKey(toDate(r.date)) === key;

// ---------------------------------------------------------------------------
// 1. Sažetak mjeseca
// ---------------------------------------------------------------------------

export interface MonthSummary {
  income: number;
  spend: number;
  net: number;
}

export function monthSummary(rows: readonly ObradaRow[], ref: Date): MonthSummary {
  const key = monthKeyOf(ref);
  let income = 0;
  let spend = 0;
  for (const r of rows) {
    if (!isPersonal(r) || !isLive(r) || !inMonth(r, key)) continue;
    if (isRealIncome(r)) income += Number(r.amount) || 0;
    else if (isRealSpend(r)) spend += Number(r.amount) || 0;
  }
  return { income: round2(income), spend: round2(spend), net: round2(income - spend) };
}

// ---------------------------------------------------------------------------
// 2. „Gdje curi" — rast po skupini i kategoriji prema prosjeku zadnja 3 mjeseca
// ---------------------------------------------------------------------------

export interface GrowthItem {
  /** Ključ skupine ili originalni naziv kategorije. */
  key: string;
  /** i18n ključ oznake (skupina) ili naziv kategorije. */
  labelKey: string;
  current: number;
  average: number;
  delta: number;
  ratio: number;
}

export interface GroupGrowth extends GrowthItem {
  categories: GrowthItem[];
}

interface Bucket {
  labelKey: string;
  perMonth: Map<string, number>;
}

const collectSpend = (
  rows: readonly ObradaRow[],
  keyOf: (r: ObradaRow) => { key: string; labelKey: string } | null,
): Map<string, Bucket> => {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    if (!isPersonal(r) || !isLive(r) || !isRealSpend(r)) continue;
    const k = keyOf(r);
    if (!k) continue;
    let b = map.get(k.key);
    if (!b) {
      b = { labelKey: k.labelKey, perMonth: new Map() };
      map.set(k.key, b);
    }
    const mk = monthKey(toDate(r.date));
    b.perMonth.set(mk, (b.perMonth.get(mk) ?? 0) + (Number(r.amount) || 0));
  }
  return map;
};

const toGrowthItems = (
  map: Map<string, Bucket>,
  currentKey: string,
  prevKeys: readonly string[],
): GrowthItem[] => {
  const items: GrowthItem[] = [];
  for (const [key, b] of map) {
    const current = b.perMonth.get(currentKey) ?? 0;
    const avg = prevKeys.reduce((s, k) => s + (b.perMonth.get(k) ?? 0), 0) / prevKeys.length;
    const delta = current - avg;
    if (avg <= 0) continue; // P = 0: nema osnove za usporedbu
    if (current <= avg * GROWTH_MIN_RATIO) continue;
    if (delta < GROWTH_MIN_DELTA) continue;
    items.push({
      key,
      labelKey: b.labelKey,
      current: round2(current),
      average: round2(avg),
      delta: round2(delta),
      ratio: Math.round((current / avg) * 100) / 100,
    });
  }
  return items.sort((a, b) => b.delta - a.delta);
};

/**
 * Rast po skupini, a unutar skupine po kategoriji. Skupina ulazi samo ako
 * zadovoljava prag; kategorije se prikazuju unutar uključene skupine po istom
 * pravilu.
 */
export function growthByGroup(rows: readonly ObradaRow[], ref: Date): GroupGrowth[] {
  const currentKey = monthKeyOf(ref);
  const prevKeys = lastMonthKeys(ref, 4).slice(0, 3); // 3 puna mjeseca prije

  const groups = collectSpend(rows, (r) => {
    const cat = (r.category ?? '').trim();
    if (!cat) return null;
    const tree = resolveTreeCategory(cat);
    if (!tree.groupKey) return null;
    return { key: tree.groupKey, labelKey: categoryGroupLabelKey(tree.groupKey) };
  });

  const catsByGroup = new Map<CategoryGroupKey, Map<string, Bucket>>();
  for (const r of rows) {
    if (!isPersonal(r) || !isLive(r) || !isRealSpend(r)) continue;
    const cat = (r.category ?? '').trim();
    if (!cat) continue;
    const tree = resolveTreeCategory(cat);
    if (!tree.groupKey) continue;
    let m = catsByGroup.get(tree.groupKey);
    if (!m) {
      m = new Map();
      catsByGroup.set(tree.groupKey, m);
    }
    let b = m.get(cat);
    if (!b) {
      b = { labelKey: tree.label ?? tree.customName ?? cat, perMonth: new Map() };
      m.set(cat, b);
    }
    const mk = monthKey(toDate(r.date));
    b.perMonth.set(mk, (b.perMonth.get(mk) ?? 0) + (Number(r.amount) || 0));
  }

  return toGrowthItems(groups, currentKey, prevKeys).map((g) => ({
    ...g,
    categories: toGrowthItems(
      catsByGroup.get(g.key as CategoryGroupKey) ?? new Map(),
      currentKey,
      prevKeys,
    ),
  }));
}

// ---------------------------------------------------------------------------
// 3. Ponavljajući troškovi (bez AI-ja)
// ---------------------------------------------------------------------------

export interface RecurringMerchant {
  key: string;
  name: string;
  /** Zbroj u odabranom mjesecu. */
  monthTotal: number;
  /** Prosjek po mjesecu u prozoru od 4 mjeseca. */
  monthlyAverage: number;
  /** Godišnja projekcija = monthlyAverage × 12. */
  yearlyProjection: number;
  /** Broj mjeseci prisutnosti u prozoru. */
  monthsPresent: number;
  /** Postoji aktivno pravilo pretplate za ovog trgovca. */
  isKnownSubscription: boolean;
}

export interface RecurringRuleShape {
  description?: string | null;
  merchant_name?: string | null;
  type?: string | null;
  is_active?: boolean | null;
  business_profile_id?: string | null;
}

const merchantKeyOf = (r: ObradaRow): string => {
  const raw =
    (r.merchant_name ?? '').trim() ||
    (r.counterparty_name_snapshot ?? '').trim() ||
    (r.description ?? '').trim();
  return normalizeMerchant(raw);
};

/**
 * Ponavljajući trgovci: isti normalizirani ključ u barem 3 od zadnja 4
 * mjeseca. Jedan redak po trgovcu; ako postoji aktivno pravilo pretplate s
 * istim ključem, redak se označi (ne duplicira se).
 */
export function recurringMerchants(
  rows: readonly ObradaRow[],
  ref: Date,
  rules: readonly RecurringRuleShape[] = [],
): RecurringMerchant[] {
  const windowKeys = lastMonthKeys(ref, RECURRING_WINDOW_MONTHS);
  const currentKey = monthKeyOf(ref);

  const knownSubscriptionKeys = new Set(
    rules
      .filter((r) => r.is_active && isExpenseType(r) && !r.business_profile_id)
      .map((r) => normalizeMerchant((r.merchant_name ?? '').trim() || (r.description ?? '').trim()))
      .filter(Boolean),
  );

  interface Agg {
    names: Map<string, number>;
    perMonth: Map<string, number>;
  }
  const map = new Map<string, Agg>();
  for (const r of rows) {
    if (!isPersonal(r) || !isLive(r) || !isRealSpend(r)) continue;
    const key = merchantKeyOf(r);
    if (!key) continue;
    const mk = monthKey(toDate(r.date));
    if (!windowKeys.includes(mk)) continue;
    let a = map.get(key);
    if (!a) {
      a = { names: new Map(), perMonth: new Map() };
      map.set(key, a);
    }
    const display =
      (r.merchant_name ?? '').trim() ||
      (r.counterparty_name_snapshot ?? '').trim() ||
      (r.description ?? '').trim();
    if (display) a.names.set(display, (a.names.get(display) ?? 0) + 1);
    a.perMonth.set(mk, (a.perMonth.get(mk) ?? 0) + (Number(r.amount) || 0));
  }

  const out: RecurringMerchant[] = [];
  for (const [key, a] of map) {
    const monthsPresent = windowKeys.filter((k) => (a.perMonth.get(k) ?? 0) > 0).length;
    if (monthsPresent < RECURRING_MIN_MONTHS) continue;
    const total = windowKeys.reduce((s, k) => s + (a.perMonth.get(k) ?? 0), 0);
    const monthlyAverage = total / windowKeys.length;
    let best = key;
    let bestN = -1;
    for (const [name, n] of a.names) if (n > bestN) { best = name; bestN = n; }
    out.push({
      key,
      name: best,
      monthTotal: round2(a.perMonth.get(currentKey) ?? 0),
      monthlyAverage: round2(monthlyAverage),
      yearlyProjection: round2(monthlyAverage * 12),
      monthsPresent,
      isKnownSubscription: knownSubscriptionKeys.has(key),
    });
  }
  return out.sort((a, b) => b.yearlyProjection - a.yearlyProjection);
}

// ---------------------------------------------------------------------------
// 4. Izvan budžeta (postojeći izračun, samo osobni budžeti)
// ---------------------------------------------------------------------------

export interface OverBudgetItem {
  budgetId: string;
  budgetName: string;
  categoryKey: string;
  labelKey: string;
  limit: number;
  spent: number;
  overBy: number;
}

interface BudgetCategoryStatsLike {
  category: string;
  limit_amount: number;
  spent: number;
  isOverBudget: boolean;
}

interface BudgetLike {
  id: string;
  name: string;
  project_id?: string | null;
  categories?: readonly BudgetCategoryStatsLike[];
}

export function overBudgetItems(budgets: readonly BudgetLike[]): OverBudgetItem[] {
  const out: OverBudgetItem[] = [];
  for (const b of budgets) {
    if (b.project_id) continue; // samo osobni budžeti
    for (const c of b.categories ?? []) {
      if (!c.isOverBudget) continue;
      const tree = resolveTreeCategory(c.category);
      out.push({
        budgetId: b.id,
        budgetName: b.name,
        categoryKey: c.category,
        labelKey: tree.label ?? tree.customName ?? c.category,
        limit: round2(c.limit_amount),
        spent: round2(c.spent),
        overBy: round2(c.spent - c.limit_amount),
      });
    }
  }
  return out.sort((a, b) => b.overBy - a.overBy);
}
