/**
 * Obrada — „Mjesečni pogled: gdje curi" (Temelj, korak 4).
 * Čisti helperi bez Reacta; rade nad redcima oblika `Expense`.
 * Sve brojke idu kroz isRealSpend/isRealIncome, samo osobni redci
 * (bez project_id i business_profile_id), deleted_at null.
 */
import { isExpenseType, isRealIncome, isRealSpend } from '@/lib/spendClassification';
import { categoryGroupLabelKey, resolveTreeCategory, UNSORTED_LABEL_KEY, type CategoryGroupKey } from '@/lib/categoryTree';
import { parseGroupLimitKey, placeExpenseCategory, toGroupLimitKey, type GroupedCustomCategory } from '@/lib/categoryGroupMatch';
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
  deleted_at?: string | null;
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

/** Oznaka retka: i18n ključ (skupina/list) ili ime vlastite kategorije. Nikad sirovi ključ. */
export interface GrowthLabel {
  labelKey: string | null;
  customName: string | null;
}

export interface GrowthItem extends GrowthLabel {
  /** Ključ skupine, ključ lista ili id vlastite kategorije. */
  key: string;
  current: number;
  average: number;
  delta: number;
  ratio: number;
}

export interface GroupGrowth extends GrowthItem {
  /** Vrijednost za `matchesCategoryFilter`: `group:<g>` ili točan ključ vlastite kategorije. */
  filter: string;
  categories: GrowthItem[];
}

interface Bucket extends GrowthLabel {
  perMonth: Map<string, number>;
}

const addToBucket = (map: Map<string, Bucket>, key: string, label: GrowthLabel, r: ObradaRow) => {
  let b = map.get(key);
  if (!b) {
    b = { ...label, perMonth: new Map() };
    map.set(key, b);
  }
  const mk = monthKey(toDate(r.date));
  b.perMonth.set(mk, (b.perMonth.get(mk) ?? 0) + (Number(r.amount) || 0));
};

const toGrowthItems = (
  map: Map<string, Bucket>,
  currentKey: string,
  prevKeys: readonly string[],
): GrowthItem[] => {
  const items: GrowthItem[] = [];
  for (const [key, b] of map) {
    const current = b.perMonth.get(currentKey) ?? 0;
    // Uvijek dijeli s 3 puna mjeseca — mjesec bez zapisa je 0, ne izostavlja se.
    const avg = prevKeys.reduce((s, k) => s + (b.perMonth.get(k) ?? 0), 0) / prevKeys.length;
    const delta = current - avg;
    if (avg <= 0) continue; // P = 0: nema osnove za usporedbu
    if (current <= avg * GROWTH_MIN_RATIO) continue;
    if (delta < GROWTH_MIN_DELTA) continue;
    items.push({
      key,
      labelKey: b.labelKey,
      customName: b.customName,
      current: round2(current),
      average: round2(avg),
      delta: round2(delta),
      ratio: Math.round((current / avg) * 100) / 100,
    });
  }
  return items.sort((a, b) => b.delta - a.delta);
};

/** Oznaka jedne vrijednosti `category` (list ili vlastita kategorija). */
export function categoryLabel(
  category: string,
  customs: readonly GroupedCustomCategory[] = [],
): GrowthLabel {
  const custom = customs.find((c) => c.id === category);
  if (custom) return { labelKey: null, customName: custom.name ?? null };
  const tree = resolveTreeCategory(category);
  return { labelKey: tree.label ?? UNSORTED_LABEL_KEY, customName: null };
}

const TOP_GROUP = 'g:';
const TOP_CUSTOM = 'c:';

/**
 * Rast po skupini, a unutar skupine po kategoriji. Vlastita kategorija s
 * `group_key` ide u tu skupinu; bez njega je zaseban redak pod svojim imenom.
 */
export function growthByGroup(
  rows: readonly ObradaRow[],
  ref: Date,
  customs: readonly GroupedCustomCategory[] = [],
): GroupGrowth[] {
  const currentKey = monthKeyOf(ref);
  const prevKeys = lastMonthKeys(ref, 4).slice(0, 3); // 3 puna mjeseca prije
  const customList = [...customs];

  const top = new Map<string, Bucket>();
  const catsByGroup = new Map<CategoryGroupKey, Map<string, Bucket>>();

  for (const r of rows) {
    if (!isPersonal(r) || !isLive(r) || !isRealSpend(r)) continue;
    const cat = (r.category ?? '').trim();
    if (!cat) continue;
    const place = placeExpenseCategory(cat, customList);
    if (place.group) {
      addToBucket(top, TOP_GROUP + place.group, { labelKey: categoryGroupLabelKey(place.group), customName: null }, r);
      let m = catsByGroup.get(place.group);
      if (!m) {
        m = new Map();
        catsByGroup.set(place.group, m);
      }
      addToBucket(m, cat, categoryLabel(cat, customList), r);
    } else if (place.customId) {
      addToBucket(top, TOP_CUSTOM + place.customId, categoryLabel(cat, customList), r);
    }
  }

  return toGrowthItems(top, currentKey, prevKeys).map((g) => {
    if (g.key.startsWith(TOP_CUSTOM)) {
      const id = g.key.slice(TOP_CUSTOM.length);
      return { ...g, key: id, filter: id, categories: [] };
    }
    const group = g.key.slice(TOP_GROUP.length) as CategoryGroupKey;
    return {
      ...g,
      key: group,
      filter: toGroupLimitKey(group),
      categories: toGrowthItems(catsByGroup.get(group) ?? new Map(), currentKey, prevKeys),
    };
  });
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
  labelKey: string | null;
  customName: string | null;
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

export function overBudgetItems(
  budgets: readonly BudgetLike[],
  customs: readonly GroupedCustomCategory[] = [],
): OverBudgetItem[] {
  const out: OverBudgetItem[] = [];
  for (const b of budgets) {
    if (b.project_id) continue; // samo osobni budžeti
    for (const c of b.categories ?? []) {
      if (!c.isOverBudget) continue;
      const label = parseGroupLimitKey(c.category)
        ? { labelKey: categoryGroupLabelKey(parseGroupLimitKey(c.category) as CategoryGroupKey), customName: null }
        : categoryLabel(c.category, customs);
      out.push({
        budgetId: b.id,
        budgetName: b.name,
        categoryKey: c.category,
        ...label,
        limit: round2(c.limit_amount),
        spent: round2(c.spent),
        overBy: round2(c.spent - c.limit_amount),
      });
    }
  }
  return out.sort((a, b) => b.overBy - a.overBy);
}
