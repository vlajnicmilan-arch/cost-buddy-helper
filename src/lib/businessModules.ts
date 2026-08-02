export type IndustryType = 'construction' | 'hospitality' | 'retail' | 'manufacturing' | 'services' | 'healthcare' | 'flatrate' | 'other';
export type ModuleId = 'projects';

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  description: string;
  icon: string;
}

export const MODULES: ModuleDefinition[] = [
  { id: 'projects', label: 'Projekti / Gradilišta', description: 'Praćenje projekata, budžeta i radova', icon: '🏗️' },
];

export interface IndustryDefinition {
  id: IndustryType;
  label: string;
  icon: string;
  recommended: ModuleId[];
  optional: ModuleId[];
  categories: string[];
}

export const INDUSTRIES: IndustryDefinition[] = [
  {
    id: 'construction', label: 'Građevina', icon: '🏗️',
    recommended: ['projects'],
    optional: [],
    categories: ['Materijal', 'Podizvođači', 'Strojevi i oprema', 'Gorivo', 'Zaštita na radu', 'Transport', 'Geodetske usluge', 'Dozvole i takse', 'Osiguranje', 'Najam opreme'],
  },
  {
    id: 'hospitality', label: 'Ugostiteljstvo', icon: '🍽️',
    recommended: [],
    optional: ['projects'],
    categories: ['Namirnice', 'Piće', 'Osoblje', 'Čišćenje i higijena', 'Inventar', 'Energija', 'Najam prostora', 'Marketing', 'Koncesije', 'Održavanje opreme'],
  },
  {
    id: 'retail', label: 'Trgovina', icon: '🛒',
    recommended: [],
    optional: ['projects'],
    categories: ['Nabava robe', 'Skladištenje', 'Transport', 'Ambalaža', 'Najam', 'Marketing', 'Osoblje', 'Energija', 'Osiguranje', 'IT sustavi'],
  },
  {
    id: 'manufacturing', label: 'Proizvodnja', icon: '🏭',
    recommended: ['projects'],
    optional: [],
    categories: ['Sirovine', 'Energija', 'Strojevi', 'Održavanje', 'Osoblje', 'Transport', 'Ambalaža', 'Kontrola kvalitete', 'Otpad', 'Alat'],
  },
  {
    id: 'services', label: 'Usluge', icon: '💼',
    recommended: ['projects'],
    optional: [],
    categories: ['Osoblje', 'Najam ureda', 'IT oprema', 'Software', 'Marketing', 'Putni troškovi', 'Edukacija', 'Telekomunikacije', 'Osiguranje', 'Uredski materijal'],
  },
  {
    id: 'healthcare', label: 'Zdravstvo', icon: '🏥',
    recommended: [],
    optional: ['projects'],
    categories: ['Medicinska oprema', 'Lijekovi/materijali', 'Osoblje', 'Najam', 'Energija', 'Sterilizacija', 'Osiguranje', 'Edukacija', 'IT sustavi', 'Otpad'],
  },
  {
    id: 'flatrate', label: 'Obrtnik paušalac', icon: '📋',
    recommended: [],
    optional: ['projects'],
    categories: ['Materijal', 'Alat', 'Gorivo', 'Telefon/Internet', 'Uredski materijal', 'Bankarske naknade', 'Računovodstvo', 'Edukacija', 'Software', 'Osiguranje'],
  },
  {
    id: 'other', label: 'Ostalo', icon: '🔧',
    recommended: [],
    optional: ['projects'],
    categories: [],
  },
];

export const getIndustry = (id: IndustryType): IndustryDefinition =>
  INDUSTRIES.find(i => i.id === id) || INDUSTRIES[INDUSTRIES.length - 1];

/**
 * Modul projekata je dostupan svakoj tvrtki, bez obzira na djelatnost.
 * Ovo je samo vidljivost po tvrtki — pravo pisanja i dalje odlucuje
 * pretplata (`user_entitlements` / `can_write_module`).
 */
export const ALWAYS_ENABLED_MODULES: ModuleId[] = ['projects'];

const withAlwaysEnabled = (modules: ModuleId[]): ModuleId[] =>
  Array.from(new Set([...ALWAYS_ENABLED_MODULES, ...modules]));

export const getDefaultModules = (industryId: IndustryType): ModuleId[] =>
  withAlwaysEnabled(getIndustry(industryId).recommended);

export const getAvailableModules = (industryId: IndustryType): ModuleId[] => {
  const industry = getIndustry(industryId);
  return withAlwaysEnabled([...industry.recommended, ...industry.optional]);
};

export const isModuleEnabled = (enabledModules: string[], moduleId: ModuleId): boolean =>
  ALWAYS_ENABLED_MODULES.includes(moduleId) || enabledModules.includes(moduleId);

