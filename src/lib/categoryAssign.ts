/**
 * Automatsko razvrstavanje na ključeve stabla kategorija (nalog 6).
 * Zrcalo: supabase/functions/_shared/categoryAssign.ts — SHARED CORE mora biti identičan.
 *
 * Jedna provjera za sve što AI ili pravilo vrati:
 *  - list iz registra → list
 *  - korisnikova kategorija (id ili točan naziv) → njen id
 *  - stari ključ s aliasom na list → list
 *  - široki stari ključ → ostaje stari ključ (registar ga čita kao skupina + nerazvrstano)
 *  - bilo što drugo → rezervni ključ `other` + oznaka `unknown` (za dijagnostiku)
 * Automatika NIKAD ne postavlja `movement_kind` ni `tags`: izlaz nosi samo kategoriju.
 */
import {
  CATEGORY_GROUPS,
  CATEGORY_LEAVES,
  LEGACY_ALIASES,
  type CategoryGroupKey,
} from './categoryTree';

// ---------------- SHARED CORE START ----------------
/** Oznaka verzije stabla koju nova aplikacija šalje u zahtjevu. */
export const CATEGORY_TREE_VERSION = 2;
/** Postojeći rezervni ključ (stari „Ostalo" → skupina Ostalo + nerazvrstano). */
export const FALLBACK_CATEGORY = 'other';
/** „Pokrivanje drugih pizdarija" — izuzeta iz svega, po ID-u. */
export const EXEMPT_CATEGORY_ID = 'ab61e917-645c-465c-94f4-aec2645062e9';

export type AssignDirection = 'expense' | 'income';

export interface AssignCustomCategory {
  id: string;
  name: string;
  group_key?: string | null;
}

export type AssignSource = 'leaf' | 'custom' | 'alias_leaf' | 'alias_unsorted' | 'transfer' | 'fallback';

export interface AssignedCategory {
  category: string;
  source: AssignSource;
  /** true kad ulaz nije prepoznat (za dijagnostiku). */
  unknown: boolean;
}

export const normalizeText = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

/** Ključ trgovca: bez broja kartice, brojeva i repa iza „ - " / zareza; prve 3 riječi. */
export const merchantKey = (row: { merchant_name?: string | null; description?: string | null }): string => {
  const base = normalizeText(row.merchant_name || row.description);
  const head = base.split(/ - |,/)[0] ?? '';
  const cleaned = head
    .replace(/\*+/g, ' ')
    .replace(/\d[\dx]*/g, ' ')
    .replace(/[^a-z&.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').slice(0, 3).join(' ');
};

const leafGroup = (key: string): CategoryGroupKey | null =>
  CATEGORY_LEAVES.find((l) => l.key === key)?.group ?? null;

const directionFits = (group: CategoryGroupKey | null, direction: AssignDirection): boolean =>
  group === null ? false : direction === 'income' ? group === 'income' : group !== 'income';

/** Jedina provjera izlaza AI-ja / pravila / naučenog ispravka. */
export const normalizeAssignedCategory = (
  raw: string | null | undefined,
  opts: { customCategories?: AssignCustomCategory[]; direction?: AssignDirection; allowTransfer?: boolean } = {},
): AssignedCategory => {
  const direction = opts.direction ?? 'expense';
  const customs = (opts.customCategories ?? []).filter((c) => c.id !== EXEMPT_CATEGORY_ID);
  const value = (raw ?? '').trim().replace(/^["'`]+|["'`.]+$/g, '').trim();
  const lower = value.toLowerCase();
  const fallback: AssignedCategory = { category: FALLBACK_CATEGORY, source: 'fallback', unknown: true };
  if (!value) return fallback;

  if (lower === 'transfer') {
    return opts.allowTransfer ? { category: 'transfer', source: 'transfer', unknown: false } : fallback;
  }

  if (direction === 'expense') {
    const byId = customs.find((c) => c.id === value);
    if (byId) return { category: byId.id, source: 'custom', unknown: false };
    const byName = customs.find((c) => normalizeText(c.name) === normalizeText(value));
    if (byName) return { category: byName.id, source: 'custom', unknown: false };
  }

  if (Object.prototype.hasOwnProperty.call(LEGACY_ALIASES, lower)) {
    const alias = LEGACY_ALIASES[lower];
    if (alias.kind === 'leaf') {
      if (!directionFits(alias.group, direction)) return fallback;
      return {
        category: alias.leaf,
        source: alias.leaf === lower ? 'leaf' : 'alias_leaf',
        unknown: false,
      };
    }
    if (alias.kind === 'unsorted') {
      if (!directionFits(alias.group, direction)) return fallback;
      return { category: lower, source: 'alias_unsorted', unknown: false };
    }
    return fallback;
  }

  const group = leafGroup(lower);
  if (group && directionFits(group, direction)) return { category: lower, source: 'leaf', unknown: false };
  return fallback;
};

export interface LearnedCorrection {
  user_id: string;
  corrected_category: string;
  merchant_name?: string | null;
  description?: string | null;
  created_at: string;
  reverted_at?: string | null;
}

/**
 * Korisnikov ispravak pobjeđuje AI: najnoviji neponišteni ispravak istog
 * korisnika za isti ključ trgovca. Tuđi i poništeni ispravci se ne koriste.
 */
export const pickLearnedCategory = (
  row: { merchant_name?: string | null; description?: string | null },
  corrections: LearnedCorrection[],
  opts: { userId: string; customCategories?: AssignCustomCategory[]; direction?: AssignDirection },
): AssignedCategory | null => {
  const key = merchantKey(row);
  if (!key || !opts.userId) return null;
  const hits = corrections
    .filter((c) => c.user_id === opts.userId && !c.reverted_at && merchantKey(c) === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const c of hits) {
    if (c.corrected_category === EXEMPT_CATEGORY_ID) return null;
    const res = normalizeAssignedCategory(c.corrected_category, {
      customCategories: opts.customCategories,
      direction: opts.direction,
    });
    return res.unknown ? null : res;
  }
  return null;
};

/**
 * Popis dopuštenih ključeva za AI, generiran iz registra:
 * „- ključ → naziv (skupina: naziv skupine)". Nazivi dolaze iz kataloga (HR).
 */
export const buildAllowedCategoryLines = (
  labels: { groups: Record<string, string>; leaves: Record<string, string>; mine: string },
  opts: { customCategories?: AssignCustomCategory[]; direction?: AssignDirection } = {},
): { keys: string[]; lines: string } => {
  const direction = opts.direction ?? 'expense';
  const keys: string[] = [];
  const lines: string[] = [];
  for (const g of CATEGORY_GROUPS) {
    if (!directionFits(g.key, direction)) continue;
    for (const leaf of g.leaves) {
      keys.push(leaf);
      lines.push(`- ${leaf} → ${labels.leaves[leaf] ?? leaf} (skupina: ${labels.groups[g.key] ?? g.key})`);
    }
  }
  if (direction === 'expense') {
    for (const c of opts.customCategories ?? []) {
      if (c.id === EXEMPT_CATEGORY_ID) continue;
      const gk = c.group_key && labels.groups[c.group_key] ? labels.groups[c.group_key] : labels.mine;
      keys.push(c.id);
      lines.push(`- ${c.id} → ${c.name} (skupina: ${gk})`);
    }
  }
  return { keys, lines: lines.join('\n') };
};
// ---------------- SHARED CORE END ----------------
