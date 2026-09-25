/**
 * Opcije izbornika kategorija u dvije razine (skupina → list) za OSOBNI način.
 * Čista logika bez prikaza — koristi je TreeCategoryOptions i testovi.
 * Projektni i poslovni registar ovdje se NE koriste.
 */
import {
  CATEGORY_GROUPS,
  CATEGORY_LEAVES,
  CategoryGroupKey,
  categoryGroupLabelKey,
  categoryLeafLabelKey,
  resolveTreeCategory,
} from '@/lib/categoryTree';
import { CATEGORIES, INCOME_CATEGORIES } from '@/types/expense';

export const MINE_GROUP_LABEL_KEY = 'categoryTree.groups.mine';
export const LEGACY_SECTION_LABEL_KEY = 'categoryTree.legacySection';
export const CURRENT_SECTION_LABEL_KEY = 'categoryTree.currentSection';

export const CATEGORY_GROUP_KEYS: CategoryGroupKey[] = CATEGORY_GROUPS.map((g) => g.key);

export interface TreeOptionCustom {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  group_key?: string | null;
}

export interface TreeOptionItem {
  value: string;
  /** i18n ključ; null za korisničku kategoriju (tada `name`). */
  labelKey: string | null;
  name: string | null;
  icon: string;
  color: string | null;
  isCustom: boolean;
}

export interface TreeOptionSection {
  key: string;
  labelKey: string;
  items: TreeOptionItem[];
}

const isGroupKey = (v: string | null | undefined): v is CategoryGroupKey =>
  !!v && (CATEGORY_GROUP_KEYS as string[]).includes(v);

const customItem = (c: TreeOptionCustom, valuePrefix = ''): TreeOptionItem => ({
  value: `${valuePrefix}${c.id}`,
  labelKey: null,
  name: c.name,
  icon: c.icon || '📦',
  color: c.color ?? null,
  isCustom: true,
});

export interface BuildTreeOptionsInput {
  mode: 'expense' | 'income';
  customCategories?: TreeOptionCustom[];
  /** Vlastite kategorije prihoda (zasebna tablica, bez skupine → uvijek „Moje kategorije"). */
  customIncomeCategories?: TreeOptionCustom[];
  /** Trenutna vrijednost zapisa; ako nije među ponuđenima, dodaje se kao „Trenutno" da se naziv ne izgubi. */
  currentValue?: string | null;
  /** Filtri: dodaje stare ugrađene ključeve jer postojeći zapisi i dalje nose njih. */
  includeLegacy?: boolean;
}

export const buildTreeCategorySections = ({
  mode,
  customCategories = [],
  customIncomeCategories = [],
  currentValue,
  includeLegacy = false,
}: BuildTreeOptionsInput): TreeOptionSection[] => {
  const sections: TreeOptionSection[] = [];

  const mine: TreeOptionItem[] = mode === 'expense'
    ? customCategories.filter((c) => !isGroupKey(c.group_key)).map((c) => customItem(c))
    : customIncomeCategories.map((c) => customItem(c));
  if (mine.length) sections.push({ key: 'mine', labelKey: MINE_GROUP_LABEL_KEY, items: mine });

  const groups = CATEGORY_GROUPS.filter((g) => (mode === 'income' ? g.key === 'income' : g.key !== 'income'));
  for (const g of groups) {
    const items: TreeOptionItem[] = [
      ...(mode === 'expense'
        ? customCategories.filter((c) => c.group_key === g.key).map((c) => customItem(c))
        : []),
      ...CATEGORY_LEAVES.filter((l) => l.group === g.key).map((l) => ({
        value: l.key,
        labelKey: categoryLeafLabelKey(l.key),
        name: null,
        icon: l.icon,
        color: null,
        isCustom: false,
      })),
    ];
    if (items.length) sections.push({ key: g.key, labelKey: categoryGroupLabelKey(g.key), items });
  }

  const offered = new Set(sections.flatMap((s) => s.items.map((i) => i.value)));

  if (includeLegacy) {
    const legacySource = mode === 'income' ? INCOME_CATEGORIES : CATEGORIES;
    const legacy = legacySource
      .filter((c) => !offered.has(c.id))
      .map((c) => {
        const r = resolveTreeCategory(c.id);
        return {
          value: c.id,
          labelKey: `${mode === 'income' ? 'incomeCategories' : 'categories'}.${c.id}`,
          name: null,
          icon: c.icon || r.icon,
          color: null,
          isCustom: false,
        } as TreeOptionItem;
      });
    legacy.forEach((i) => offered.add(i.value));
    if (legacy.length) sections.push({ key: 'legacy', labelKey: LEGACY_SECTION_LABEL_KEY, items: legacy });
  }

  const cur = (currentValue ?? '').trim();
  if (cur && !offered.has(cur)) {
    const r = resolveTreeCategory(cur, [...customCategories, ...customIncomeCategories]);
    sections.unshift({
      key: 'current',
      labelKey: CURRENT_SECTION_LABEL_KEY,
      items: [{
        value: cur,
        labelKey: r.isCustom ? null : r.label,
        name: r.isCustom ? r.customName : null,
        icon: r.icon,
        color: null,
        isCustom: r.isCustom,
      }],
    });
  }

  return sections;
};

/** Premještanje vlastite kategorije: dopušta samo ključ skupine ili NULL („Moje kategorije"). */
export const buildGroupKeyUpdate = (groupKey: string | null): { group_key: CategoryGroupKey | null } => {
  if (groupKey === null) return { group_key: null };
  if (!isGroupKey(groupKey) || groupKey === 'income') throw new Error(`invalid_group_key:${groupKey}`);
  return { group_key: groupKey };
};

/** Skupine u koje se smije smjestiti vlastita kategorija troška. */
export const EXPENSE_GROUP_KEYS: CategoryGroupKey[] = CATEGORY_GROUP_KEYS.filter((g) => g !== 'income');

/** Razlika vlastite kategorije: vraća samo promijenjena polja (premještanje ne dira naziv, ikonu ni boju). */
export const buildCustomCategoryUpdates = (
  before: { name: string; icon: string; color: string; group_key?: string | null },
  after: { name: string; icon: string; color: string; group_key: string | null },
): Partial<{ name: string; icon: string; color: string; group_key: CategoryGroupKey | null }> => {
  const out: Partial<{ name: string; icon: string; color: string; group_key: CategoryGroupKey | null }> = {};
  if (after.name !== before.name) out.name = after.name;
  if (after.icon !== before.icon) out.icon = after.icon;
  if (after.color !== before.color) out.color = after.color;
  if ((after.group_key ?? null) !== (before.group_key ?? null)) Object.assign(out, buildGroupKeyUpdate(after.group_key));
  return out;
};

/** Je li vrijednost ključ lista iz registra (novi osobni ključ). */
export const isTreeLeafKey = (v: string | null | undefined): boolean =>
  !!v && CATEGORY_LEAVES.some((l) => l.key === v);
