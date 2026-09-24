/**
 * Zrcalo src/lib/categoryTree.ts — SHARED CORE mora biti identičan.
 */
// ---------------- SHARED CORE START ----------------
export type CategoryGroupKey =
  | 'cafes' | 'food' | 'car' | 'travel' | 'work' | 'home' | 'loans'
  | 'fees_taxes' | 'personal' | 'fun' | 'other' | 'income';

export interface CategoryLeafDef {
  key: string;
  group: CategoryGroupKey;
  icon: string;
}

export interface CategoryGroupDef {
  key: CategoryGroupKey;
  icon: string;
  leaves: string[];
}

/** Dogovoreno stablo. Redoslijed = redoslijed prikaza. */
export const CATEGORY_GROUPS: CategoryGroupDef[] = [
  { key: 'cafes', icon: '☕', leaves: ['coffee', 'restaurants', 'delivery', 'marenda'] },
  { key: 'food', icon: '🛒', leaves: ['groceries'] },
  { key: 'car', icon: '🚗', leaves: ['fuel', 'car_service', 'car_parts', 'tolls_parking', 'car_registration'] },
  { key: 'travel', icon: '✈️', leaves: ['ferry', 'taxi', 'lodging'] },
  { key: 'work', icon: '💼', leaves: ['material', 'tools', 'workers', 'contractors'] },
  { key: 'home', icon: '🏠', leaves: ['rent', 'utilities', 'home_goods'] },
  { key: 'loans', icon: '🏦', leaves: ['loan_repayment', 'installments'] },
  { key: 'fees_taxes', icon: '🏛️', leaves: ['bank_fees', 'taxes'] },
  { key: 'personal', icon: '👕', leaves: ['clothing', 'health', 'care'] },
  { key: 'fun', icon: '🎬', leaves: ['subscriptions', 'hobbies'] },
  { key: 'other', icon: '📦', leaves: [] },
  { key: 'income', icon: '💰', leaves: ['salary', 'work_income', 'refunds', 'other_income'] },
];

const LEAF_ICONS: Record<string, string> = {
  coffee: '☕', restaurants: '🍽️', delivery: '🛵', marenda: '🥐',
  groceries: '🛒',
  fuel: '⛽', car_service: '🔧', car_parts: '⚙️', tolls_parking: '🅿️', car_registration: '📄',
  ferry: '⛴️', taxi: '🚕', lodging: '🛏️',
  material: '🧱', tools: '🛠️', workers: '👷', contractors: '🤝',
  rent: '🏠', utilities: '💡', home_goods: '🛋️',
  loan_repayment: '🏦', installments: '💳',
  bank_fees: '🏧', taxes: '🏛️',
  clothing: '👕', health: '💊', care: '💅',
  subscriptions: '📺', hobbies: '🎟️',
  salary: '💰', work_income: '💼', refunds: '↩️', other_income: '📦',
};

export const CATEGORY_LEAVES: CategoryLeafDef[] = CATEGORY_GROUPS.flatMap((g) =>
  g.leaves.map((key) => ({ key, group: g.key, icon: LEAF_ICONS[key] ?? g.icon })),
);

const LEAF_BY_KEY = new Map(CATEGORY_LEAVES.map((l) => [l.key, l]));
const GROUP_BY_KEY = new Map(CATEGORY_GROUPS.map((g) => [g.key, g]));

export type LegacyAlias =
  | { kind: 'leaf'; group: CategoryGroupKey; leaf: string }
  | { kind: 'unsorted'; group: CategoryGroupKey }
  | { kind: 'transfer' };

/**
 * Stare ugrađene vrijednosti (osobne, prihodne i projektne).
 * Široka stara kategorija NIKAD se ne prikazuje kao određeni list — dobiva
 * samo skupinu i `unsorted`, pa ide na korisnikov pregled.
 */
export const LEGACY_ALIASES: Record<string, LegacyAlias> = {
  // sigurno → list
  groceries: { kind: 'leaf', group: 'food', leaf: 'groceries' },
  clothing: { kind: 'leaf', group: 'personal', leaf: 'clothing' },
  health: { kind: 'leaf', group: 'personal', leaf: 'health' },
  beauty: { kind: 'leaf', group: 'personal', leaf: 'care' },
  subscriptions: { kind: 'leaf', group: 'fun', leaf: 'subscriptions' },
  rent: { kind: 'leaf', group: 'home', leaf: 'rent' },
  utilities: { kind: 'leaf', group: 'home', leaf: 'utilities' },
  taxes: { kind: 'leaf', group: 'fees_taxes', leaf: 'taxes' },
  home: { kind: 'leaf', group: 'home', leaf: 'home_goods' },
  material: { kind: 'leaf', group: 'work', leaf: 'material' },
  sports: { kind: 'leaf', group: 'fun', leaf: 'hobbies' },
  salary: { kind: 'leaf', group: 'income', leaf: 'salary' },
  freelance: { kind: 'leaf', group: 'income', leaf: 'work_income' },
  other_income: { kind: 'leaf', group: 'income', leaf: 'other_income' },
  // nerazvrstano → samo skupina
  food: { kind: 'unsorted', group: 'food' },
  transport: { kind: 'unsorted', group: 'car' },
  car: { kind: 'unsorted', group: 'car' },
  shopping: { kind: 'unsorted', group: 'personal' },
  bills: { kind: 'unsorted', group: 'fees_taxes' },
  travel: { kind: 'unsorted', group: 'travel' },
  entertainment: { kind: 'unsorted', group: 'fun' },
  labor: { kind: 'unsorted', group: 'work' },
  insurance: { kind: 'unsorted', group: 'other' },
  education: { kind: 'unsorted', group: 'other' },
  gifts: { kind: 'unsorted', group: 'other' },
  pets: { kind: 'unsorted', group: 'other' },
  kids: { kind: 'unsorted', group: 'other' },
  savings: { kind: 'unsorted', group: 'other' },
  investments: { kind: 'unsorted', group: 'other' },
  charity: { kind: 'unsorted', group: 'other' },
  gift_income: { kind: 'unsorted', group: 'income' },
  sale: { kind: 'unsorted', group: 'income' },
  personal_loan: { kind: 'unsorted', group: 'income' },
  mortgage: { kind: 'unsorted', group: 'income' },
  other: { kind: 'unsorted', group: 'other' },
  // projektni registar (izvan tablice naloga) — konzervativno nerazvrstano
  subcontractor: { kind: 'unsorted', group: 'work' },
  equipment: { kind: 'unsorted', group: 'work' },
  permits: { kind: 'unsorted', group: 'fees_taxes' },
  demolition: { kind: 'unsorted', group: 'work' },
  furniture: { kind: 'unsorted', group: 'work' },
  licenses: { kind: 'unsorted', group: 'work' },
  ads: { kind: 'unsorted', group: 'work' },
  production: { kind: 'unsorted', group: 'work' },
  venue: { kind: 'unsorted', group: 'work' },
  catering: { kind: 'unsorted', group: 'work' },
  instructors: { kind: 'unsorted', group: 'work' },
  // nije trošak ni prihod
  transfer: { kind: 'transfer' },
};

export interface TreeCustomCategory {
  id: string;
  name: string;
  icon?: string | null;
}

export interface ResolvedTreeCategory {
  groupKey: CategoryGroupKey | null;
  leafKey: string | null;
  unsorted: boolean;
  invalid: boolean;
  isCustom: boolean;
  isTransfer: boolean;
  /** i18n ključ (za korisničku kategoriju: null — prikazuje se `customName`). */
  label: string | null;
  customName: string | null;
  icon: string;
}

export const categoryGroupLabelKey = (g: CategoryGroupKey): string => `categoryTree.groups.${g}`;
export const categoryLeafLabelKey = (l: string): string => `categoryTree.leaves.${l}`;
export const UNSORTED_LABEL_KEY = 'categoryTree.unsorted';
export const TRANSFER_LABEL_KEY = 'categoryTree.transfer';

const CUSTOM_INCOME_PREFIX = 'custom_income_';

/**
 * Za bilo koju vrijednost `expenses.category` vraća skupinu i list.
 * Nikad ne vraća sirovi kod kao naziv.
 */
export const resolveTreeCategory = (
  value: string | null | undefined,
  customCategories: TreeCustomCategory[] = [],
): ResolvedTreeCategory => {
  const raw = (value ?? '').trim();

  const base: ResolvedTreeCategory = {
    groupKey: null, leafKey: null, unsorted: false, invalid: false,
    isCustom: false, isTransfer: false, label: null, customName: null, icon: '📦',
  };

  if (raw) {
    const custom = customCategories.find((c) => c.id === raw);
    const customIncomeId = raw.startsWith(CUSTOM_INCOME_PREFIX) ? raw : null;
    const customIncome = customIncomeId ? customCategories.find((c) => c.id === customIncomeId) : undefined;
    const hit = custom ?? customIncome;
    if (hit) {
      return { ...base, isCustom: true, customName: hit.name, icon: hit.icon || '📦' };
    }

    if (Object.prototype.hasOwnProperty.call(LEGACY_ALIASES, raw)) {
      const alias = LEGACY_ALIASES[raw];
      if (alias.kind === 'transfer') {
        return { ...base, isTransfer: true, label: TRANSFER_LABEL_KEY, icon: '🔄' };
      }
      if (alias.kind === 'leaf') {
        const leaf = LEAF_BY_KEY.get(alias.leaf);
        return {
          ...base, groupKey: alias.group, leafKey: alias.leaf,
          label: categoryLeafLabelKey(alias.leaf), icon: leaf?.icon ?? '📦',
        };
      }
      return {
        ...base, groupKey: alias.group, unsorted: true,
        label: categoryGroupLabelKey(alias.group), icon: GROUP_BY_KEY.get(alias.group)?.icon ?? '📦',
      };
    }

    const leaf = LEAF_BY_KEY.get(raw);
    if (leaf) {
      return { ...base, groupKey: leaf.group, leafKey: leaf.key, label: categoryLeafLabelKey(leaf.key), icon: leaf.icon };
    }
  }

  return { ...base, invalid: true, label: UNSORTED_LABEL_KEY, icon: '❔' };
};
// ---------------- SHARED CORE END ----------------
