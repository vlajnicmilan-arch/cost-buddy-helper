export type IndustryType = 'construction' | 'hospitality' | 'retail' | 'manufacturing' | 'services' | 'healthcare' | 'flatrate' | 'other';
export type ModuleId = 'flatrate_limit' | 'vat_tracking' | 'workforce' | 'projects' | 'inventory' | 'travel_expenses' | 'kpi_dashboard';

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  description: string;
  icon: string;
}

export const MODULES: ModuleDefinition[] = [
  { id: 'flatrate_limit', label: 'Paušalni limit', description: 'Praćenje godišnjeg prometa vs zakonski limit', icon: '📊' },
  { id: 'vat_tracking', label: 'PDV evidencija', description: 'Ulazni/izlazni PDV po obračunskim razdobljima', icon: '🧾' },
  { id: 'workforce', label: 'Radnici & satnice', description: 'Evidencija radnih sati i troškova radne snage', icon: '👷' },
  { id: 'projects', label: 'Projekti / Gradilišta', description: 'Praćenje projekata, budžeta i radova', icon: '🏗️' },
  { id: 'inventory', label: 'Zalihe', description: 'Praćenje ulaza/izlaza robe i stanja skladišta', icon: '📦' },
  { id: 'travel_expenses', label: 'Putni troškovi', description: 'Putni nalozi, kilometraža, dnevnice', icon: '🚗' },
  
  { id: 'kpi_dashboard', label: 'KPI Dashboard', description: 'Ključni pokazatelji poslovanja', icon: '📈' },
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
    recommended: ['vat_tracking', 'workforce', 'projects', 'travel_expenses', 'invoicing', 'kpi_dashboard'],
    optional: ['inventory'],
    categories: ['Materijal', 'Podizvođači', 'Strojevi i oprema', 'Gorivo', 'Zaštita na radu', 'Transport', 'Geodetske usluge', 'Dozvole i takse', 'Osiguranje', 'Najam opreme'],
  },
  {
    id: 'hospitality', label: 'Ugostiteljstvo', icon: '🍽️',
    recommended: ['vat_tracking', 'workforce', 'inventory', 'kpi_dashboard'],
    optional: ['invoicing'],
    categories: ['Namirnice', 'Piće', 'Osoblje', 'Čišćenje i higijena', 'Inventar', 'Energija', 'Najam prostora', 'Marketing', 'Koncesije', 'Održavanje opreme'],
  },
  {
    id: 'retail', label: 'Trgovina', icon: '🛒',
    recommended: ['vat_tracking', 'inventory', 'kpi_dashboard'],
    optional: ['workforce', 'travel_expenses', 'invoicing'],
    categories: ['Nabava robe', 'Skladištenje', 'Transport', 'Ambalaža', 'Najam', 'Marketing', 'Osoblje', 'Energija', 'Osiguranje', 'IT sustavi'],
  },
  {
    id: 'manufacturing', label: 'Proizvodnja', icon: '🏭',
    recommended: ['vat_tracking', 'workforce', 'inventory', 'invoicing', 'kpi_dashboard'],
    optional: ['projects', 'travel_expenses'],
    categories: ['Sirovine', 'Energija', 'Strojevi', 'Održavanje', 'Osoblje', 'Transport', 'Ambalaža', 'Kontrola kvalitete', 'Otpad', 'Alat'],
  },
  {
    id: 'services', label: 'Usluge', icon: '💼',
    recommended: ['vat_tracking', 'projects', 'travel_expenses', 'invoicing', 'kpi_dashboard'],
    optional: ['workforce'],
    categories: ['Osoblje', 'Najam ureda', 'IT oprema', 'Software', 'Marketing', 'Putni troškovi', 'Edukacija', 'Telekomunikacije', 'Osiguranje', 'Uredski materijal'],
  },
  {
    id: 'healthcare', label: 'Zdravstvo', icon: '🏥',
    recommended: ['vat_tracking', 'workforce', 'kpi_dashboard'],
    optional: ['inventory', 'travel_expenses', 'invoicing'],
    categories: ['Medicinska oprema', 'Lijekovi/materijali', 'Osoblje', 'Najam', 'Energija', 'Sterilizacija', 'Osiguranje', 'Edukacija', 'IT sustavi', 'Otpad'],
  },
  {
    id: 'flatrate', label: 'Obrtnik paušalac', icon: '📋',
    recommended: ['flatrate_limit', 'kpi_dashboard'],
    optional: ['travel_expenses', 'invoicing'],
    categories: ['Materijal', 'Alat', 'Gorivo', 'Telefon/Internet', 'Uredski materijal', 'Bankarske naknade', 'Računovodstvo', 'Edukacija', 'Software', 'Osiguranje'],
  },
  {
    id: 'other', label: 'Ostalo', icon: '🔧',
    recommended: ['kpi_dashboard'],
    optional: ['vat_tracking', 'workforce', 'projects', 'inventory', 'travel_expenses', 'invoicing'],
    categories: [],
  },
];

export const getIndustry = (id: IndustryType): IndustryDefinition =>
  INDUSTRIES.find(i => i.id === id) || INDUSTRIES[INDUSTRIES.length - 1];

export const getDefaultModules = (industryId: IndustryType): ModuleId[] =>
  getIndustry(industryId).recommended;

export const getAvailableModules = (industryId: IndustryType): ModuleId[] => {
  const industry = getIndustry(industryId);
  return [...industry.recommended, ...industry.optional];
};

export const isModuleEnabled = (enabledModules: string[], moduleId: ModuleId): boolean =>
  enabledModules.includes(moduleId);
