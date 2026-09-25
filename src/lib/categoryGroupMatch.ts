/**
 * Skupina/list za budžete, filtre i izvoz (osobni način).
 * Jedan izvor istine: registar `categoryTree` + LEGACY_ALIASES.
 *
 * Oblik limita skupine u `budget_categories.category`: `group:<groupKey>`
 * (npr. `group:cafes`). Dvotočka se ne pojavljuje ni u ključu lista, ni u
 * starom ključu, ni u UUID-u korisničke kategorije → nema zamjene.
 */
import {
  CATEGORY_GROUPS,
  CategoryGroupKey,
  categoryGroupLabelKey,
  categoryLeafLabelKey,
  resolveTreeCategory,
  UNSORTED_LABEL_KEY,
} from '@/lib/categoryTree';
import { EXEMPT_CATEGORY_ID } from '@/lib/categoryAssign';
import { isRealSpend } from '@/lib/spendClassification';

export const GROUP_LIMIT_PREFIX = 'group:';

export interface GroupedCustomCategory {
  id: string;
  name?: string;
  group_key?: string | null;
}

const GROUP_KEYS = new Set<string>(CATEGORY_GROUPS.map((g) => g.key));

export const isCategoryGroupKey = (v: string | null | undefined): v is CategoryGroupKey =>
  !!v && GROUP_KEYS.has(v);

export const toGroupLimitKey = (group: CategoryGroupKey): string => `${GROUP_LIMIT_PREFIX}${group}`;

export const parseGroupLimitKey = (value: string | null | undefined): CategoryGroupKey | null => {
  if (!value || !value.startsWith(GROUP_LIMIT_PREFIX)) return null;
  const g = value.slice(GROUP_LIMIT_PREFIX.length);
  return isCategoryGroupKey(g) ? g : null;
};

/** Gdje zapis pripada: skupina + list (ili korisnička kategorija). */
export interface ExpenseCategoryPlace {
  group: CategoryGroupKey | null;
  leaf: string | null;
  customId: string | null;
  exempt: boolean;
}

export const placeExpenseCategory = (
  category: string | null | undefined,
  customs: GroupedCustomCategory[] = [],
): ExpenseCategoryPlace => {
  const raw = (category ?? '').trim();
  if (raw === EXEMPT_CATEGORY_ID) return { group: null, leaf: null, customId: raw, exempt: true };
  const custom = customs.find((c) => c.id === raw);
  if (custom) {
    return {
      group: isCategoryGroupKey(custom.group_key) ? custom.group_key : null,
      leaf: null, customId: custom.id, exempt: false,
    };
  }
  const r = resolveTreeCategory(raw);
  return { group: r.groupKey, leaf: r.leafKey, customId: null, exempt: false };
};

/** Što pokriva limit budžeta. */
export type BudgetLimitScope =
  | { kind: 'group'; group: CategoryGroupKey }
  | { kind: 'leaf'; group: CategoryGroupKey; leaf: string }
  | { kind: 'custom'; id: string }
  | { kind: 'exact'; key: string };

export const parseBudgetLimitScope = (
  value: string,
  customs: GroupedCustomCategory[] = [],
): BudgetLimitScope => {
  const g = parseGroupLimitKey(value);
  if (g) return { kind: 'group', group: g };
  if (customs.some((c) => c.id === value)) return { kind: 'custom', id: value };
  const r = resolveTreeCategory(value);
  // Stari široki ključ („food") → cijela skupina; stari/novi list → list.
  if (r.groupKey && r.unsorted) return { kind: 'group', group: r.groupKey };
  if (r.groupKey && r.leafKey) return { kind: 'leaf', group: r.groupKey, leaf: r.leafKey };
  return { kind: 'exact', key: value };
};

/** 2 = uski (list/korisnička/točan ključ), 1 = skupina, 0 = ne pokriva. */
const coverRank = (
  scope: BudgetLimitScope,
  category: string,
  place: ExpenseCategoryPlace,
): number => {
  if (place.exempt) return 0;
  switch (scope.kind) {
    case 'custom': return place.customId === scope.id ? 2 : 0;
    case 'exact': return category === scope.key ? 2 : 0;
    case 'leaf': return !place.customId && place.leaf === scope.leaf ? 2 : 0;
    case 'group': return place.group === scope.group ? 1 : 0;
  }
};

/**
 * Najuži limit koji pokriva zapis (list prije skupine). Vraća indeks ili -1.
 * Kod istog ranga pobjeđuje prvi po redoslijedu — nikad dva limita.
 */
export const pickNarrowestLimit = (
  category: string | null | undefined,
  scopes: BudgetLimitScope[],
  customs: GroupedCustomCategory[] = [],
): number => {
  const cat = (category ?? '').trim();
  const place = placeExpenseCategory(cat, customs);
  let best = -1;
  let bestRank = 0;
  scopes.forEach((s, i) => {
    const r = coverRank(s, cat, place);
    if (r > bestRank) { best = i; bestRank = r; }
  });
  return best;
};

export interface BudgetSpendTx {
  category?: string | null;
  amount: number;
  type?: string | null;
  expense_nature?: string | null;
  movement_kind?: string | null;
  deleted_at?: string | Date | null;
}

/** Zapis koji smije ući u osobni budžet: stvarna potrošnja, nije izuzeta kategorija. */
export const countsForPersonalBudget = (e: BudgetSpendTx): boolean =>
  isRealSpend(e as Parameters<typeof isRealSpend>[0]) && (e.category ?? '') !== EXEMPT_CATEGORY_ID;

/** Raspodjela: svaki zapis u točno jedan limit ili u `unassigned`. */
export const allocateToLimits = <T extends BudgetSpendTx>(
  list: T[],
  limitCategories: string[],
  customs: GroupedCustomCategory[] = [],
): { perLimit: T[][]; unassigned: T[] } => {
  const scopes = limitCategories.map((c) => parseBudgetLimitScope(c, customs));
  const perLimit: T[][] = limitCategories.map(() => []);
  const unassigned: T[] = [];
  for (const e of list) {
    if (!countsForPersonalBudget(e)) continue;
    const idx = pickNarrowestLimit(e.category, scopes, customs);
    if (idx >= 0) perLimit[idx].push(e);
    else unassigned.push(e);
  }
  return { perLimit, unassigned };
};

/** Filtar skupine: `group:<g>` hvata listove, stare ključeve te skupine i korisničke s tim group_key. */
export const matchesCategoryFilter = (
  category: string | null | undefined,
  filterValue: string,
  customsInGroup: string[] = [],
): boolean => {
  const g = parseGroupLimitKey(filterValue);
  if (!g) return category === filterValue;
  const cat = (category ?? '').trim();
  if (!cat || cat === EXEMPT_CATEGORY_ID) return false;
  if (customsInGroup.includes(cat)) return true;
  return resolveTreeCategory(cat).groupKey === g;
};

export const customIdsInGroup = (group: CategoryGroupKey, customs: GroupedCustomCategory[]): string[] =>
  customs.filter((c) => c.group_key === group && c.id !== EXEMPT_CATEGORY_ID).map((c) => c.id);

/** i18n oznake za skupinu i list zapisa (izvoz). Korisnička kategorija nosi `customName`. */
export interface CategoryPlaceLabels {
  groupLabelKey: string | null;
  leafLabelKey: string | null;
  customName: string | null;
  rawKey: string;
}

export const categoryPlaceLabels = (
  category: string | null | undefined,
  customs: GroupedCustomCategory[] = [],
): CategoryPlaceLabels => {
  const raw = (category ?? '').trim();
  const place = placeExpenseCategory(raw, customs);
  const custom = place.customId ? customs.find((c) => c.id === place.customId) : undefined;
  if (custom) {
    return { groupLabelKey: place.group ? categoryGroupLabelKey(place.group) : null, leafLabelKey: null, customName: custom.name ?? null, rawKey: raw };
  }
  if (!place.group) return { groupLabelKey: null, leafLabelKey: null, customName: null, rawKey: raw };
  return {
    groupLabelKey: categoryGroupLabelKey(place.group),
    leafLabelKey: place.leaf ? categoryLeafLabelKey(place.leaf) : UNSORTED_LABEL_KEY,
    customName: null,
    rawKey: raw,
  };
};

/** Zbroj po skupini s listovima ispod; stari i novi ključ iste skupine su jedan redak. */
export interface GroupTotalLeaf { key: string; amount: number; customId: string | null; leaf: string | null }
export interface GroupTotalRow { group: CategoryGroupKey | null; amount: number; leaves: GroupTotalLeaf[] }

export const UNSORTED_LEAF = '__unsorted__';

export const buildGroupedCategoryTotals = (
  byCategory: Record<string, number>,
  customs: GroupedCustomCategory[] = [],
): GroupTotalRow[] => {
  const groups = new Map<string, GroupTotalRow>();
  for (const [cat, amount] of Object.entries(byCategory)) {
    if (cat === EXEMPT_CATEGORY_ID) continue;
    const place = placeExpenseCategory(cat, customs);
    const gKey = place.group ?? '__none__';
    let row = groups.get(gKey);
    if (!row) { row = { group: place.group, amount: 0, leaves: [] }; groups.set(gKey, row); }
    row.amount += amount;
    const leafKey = place.customId
      ? `custom:${place.customId}`
      : place.leaf ?? (place.group ? UNSORTED_LEAF : cat);
    const existing = row.leaves.find((l) => l.key === leafKey);
    if (existing) existing.amount += amount;
    else row.leaves.push({ key: leafKey, amount, customId: place.customId, leaf: place.leaf });
  }
  const rows = [...groups.values()];
  rows.forEach((r) => r.leaves.sort((a, b) => b.amount - a.amount));
  return rows.sort((a, b) => b.amount - a.amount);
};
