/**
 * KATEGORIJE TROŠKA ZA PROJEKTE.
 *
 * Trošak BEZ projekta koristi osobne kategorije (`CATEGORIES` u `@/types/expense`).
 * Trošak S projektom koristi popis koji ovisi o vrsti projekta (`projects.project_type`).
 * Korisnik nikad ne bira "osobna ili projektna kategorizacija" — popis slijedi projekt.
 *
 * Ključevi su stabilni tekstualni ključevi (isti stupac `expenses.category`).
 * Nazivi za prikaz dolaze iz i18n (`categories.<key>`); `name` ovdje je samo
 * hrvatski fallback za mjesta koja rješavaju kategoriju bez i18n konteksta.
 */

export interface ProjectExpenseCategoryInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** Registar svih projektnih ključeva (jezgra + svi dodaci). */
export const PROJECT_EXPENSE_CATEGORIES: ProjectExpenseCategoryInfo[] = [
  { id: 'material', name: 'Materijal', icon: '🧱', color: 'category-shopping' },
  { id: 'labor', name: 'Rad', icon: '👷', color: 'category-bills' },
  { id: 'subcontractor', name: 'Podizvođač', icon: '🤝', color: 'category-bills' },
  { id: 'equipment', name: 'Oprema i alat', icon: '🛠️', color: 'category-shopping' },
  { id: 'transport', name: 'Prijevoz', icon: '🚚', color: 'category-transport' },
  { id: 'permits', name: 'Dozvole i naknade', icon: '📋', color: 'category-bills' },
  { id: 'demolition', name: 'Rušenje i odvoz', icon: '🧹', color: 'category-other' },
  { id: 'furniture', name: 'Namještaj i oprema', icon: '🛋️', color: 'category-shopping' },
  { id: 'licenses', name: 'Licence i hosting', icon: '🔑', color: 'category-bills' },
  { id: 'ads', name: 'Oglasi', icon: '📣', color: 'category-shopping' },
  { id: 'production', name: 'Produkcija', icon: '🎬', color: 'category-other' },
  { id: 'venue', name: 'Prostor', icon: '🏛️', color: 'category-bills' },
  { id: 'catering', name: 'Catering', icon: '🍽️', color: 'category-food' },
  { id: 'instructors', name: 'Predavači', icon: '🎓', color: 'category-other' },
  { id: 'other', name: 'Ostalo', icon: '📦', color: 'category-other' },
];

const BY_ID = new Map(PROJECT_EXPENSE_CATEGORIES.map((c) => [c.id, c]));

export const getProjectExpenseCategoryInfo = (
  id: string,
): ProjectExpenseCategoryInfo | undefined => BY_ID.get(id);

/** Jezgra koju dobiva svaka vrsta projekta; `other` je uvijek zadnji. */
const CORE_KEYS = [
  'material',
  'labor',
  'subcontractor',
  'equipment',
  'transport',
  'permits',
  'other',
] as const;

/** Dodaci po vrsti projekta (ključevi vrsta iz `@/lib/projectTypes`). */
const EXTRA_BY_TYPE: Record<string, string[]> = {
  construction_new: ['demolition'],
  renovation: ['demolition'],
  interior: ['furniture'],
  marketing: ['ads', 'production'],
  hospitality_event: ['venue', 'catering'],
  private_event: ['venue', 'catering'],
  education: ['instructors', 'venue'],
};

/** Vrste koje zamjenjuju ključ jezgre drugim ključem. */
const REPLACE_BY_TYPE: Record<string, Record<string, string>> = {
  it_software: { permits: 'licenses' },
};

/**
 * Popis kategorija za zadanu vrstu projekta.
 * Nepoznata vrsta i projekt bez vrste dobivaju jezgru.
 */
export const getCategoriesForProjectType = (
  type?: string | null,
): ProjectExpenseCategoryInfo[] => {
  const replace = (type && REPLACE_BY_TYPE[type]) || {};
  const extras = (type && EXTRA_BY_TYPE[type]) || [];

  const keys: string[] = [];
  for (const key of CORE_KEYS) {
    if (key === 'other') continue;
    keys.push(replace[key] ?? key);
  }
  for (const key of extras) keys.push(key);
  keys.push('other');

  const seen = new Set<string>();
  const result: ProjectExpenseCategoryInfo[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    const info = BY_ID.get(key);
    if (!info) continue;
    seen.add(key);
    result.push(info);
  }
  return result;
};

/** Je li ključ dopušten za projekt te vrste. */
export const isCategoryAllowedForProjectType = (
  categoryId: string | null | undefined,
  type?: string | null,
): boolean => {
  if (!categoryId) return false;
  return getCategoriesForProjectType(type).some((c) => c.id === categoryId);
};

/**
 * Kategorija nakon promjene projekta: ostaje ako je dopuštena u novom kontekstu,
 * inače se tiho prazni (bez poruke korisniku).
 */
export const nextCategoryAfterProjectChange = (
  current: string | null | undefined,
  hasProject: boolean,
  nextProjectType: string | null | undefined,
  isPersonalCategory: (id: string) => boolean,
): string => {
  if (!current) return '';
  const allowed = hasProject
    ? isCategoryAllowedForProjectType(current, nextProjectType)
    : isPersonalCategory(current);
  return allowed ? current : '';
};
