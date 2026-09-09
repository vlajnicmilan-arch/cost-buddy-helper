// Centralni registar vrsta projekata.
// project_type se postavlja jednom pri kreiranju projekta i kasnije se ne mijenja.
// Mijenja samo nazive (labele) određenih tabova i predlaže šablonu faza —
// UI struktura, komponente i podaci ostaju isti za sve tipove.

export type ProjectType =
  | 'general'
  | 'construction_new'
  | 'renovation'
  | 'interior'
  | 'it_software'
  | 'marketing'
  | 'education'
  | 'beauty'
  | 'hospitality_event'
  | 'healthcare'
  | 'retail_opening'
  | 'manufacturing'
  | 'private_event';

// Samo naziv faza ovisi o vrsti projekta. Nazivi za osobe (Članovi · Ljudi ·
// Suradnici) i Dokumenti su GLOBALNI i namjerno se ne prilagođavaju vrsti —
// dosljednost nazivlja je važnija od tematskog imenovanja.
export type LabelKey = 'milestones';

export interface ProjectTypePreset {
  id: ProjectType;
  icon: string;
  color: string;
  /** i18n key suffixes for tab labels that should be overridden for this type. */
  labelKeys: Partial<Record<LabelKey, string>>;
  /** Maps to project_templates.category for auto-filter and auto-pre-select. */
  templateCategory?: string;
}

export const PROJECT_TYPE_PRESETS: ProjectTypePreset[] = [
  {
    id: 'general',
    icon: '📁',
    color: '#3b82f6',
    labelKeys: {},
    templateCategory: 'general',
  },
  {
    id: 'construction_new',
    icon: '🏗️',
    color: '#f59e0b',
    labelKeys: {
      milestones: 'projectTypes.construction_new.labels.milestones',
    },
    templateCategory: 'construction',
  },
  {
    id: 'renovation',
    icon: '🔨',
    color: '#ef4444',
    labelKeys: {
      milestones: 'projectTypes.renovation.labels.milestones',
    },
    templateCategory: 'renovation',
  },
  {
    id: 'interior',
    icon: '🛋️',
    color: '#ec4899',
    labelKeys: {
      milestones: 'projectTypes.interior.labels.milestones',
    },
    templateCategory: 'interior',
  },
  {
    id: 'it_software',
    icon: '💻',
    color: '#06b6d4',
    labelKeys: {
      milestones: 'projectTypes.it_software.labels.milestones',
    },
    templateCategory: 'it_software',
  },
  {
    id: 'marketing',
    icon: '📣',
    color: '#8b5cf6',
    labelKeys: {
      milestones: 'projectTypes.marketing.labels.milestones',
    },
    templateCategory: 'marketing',
  },
  {
    id: 'education',
    icon: '🎓',
    color: '#22c55e',
    labelKeys: {
      milestones: 'projectTypes.education.labels.milestones',
    },
    templateCategory: 'education',
  },
  {
    id: 'beauty',
    icon: '💅',
    color: '#f472b6',
    labelKeys: {
      milestones: 'projectTypes.beauty.labels.milestones',
    },
    templateCategory: 'beauty',
  },
  {
    id: 'hospitality_event',
    icon: '🍽️',
    color: '#fb923c',
    labelKeys: {
      milestones: 'projectTypes.hospitality_event.labels.milestones',
    },
    templateCategory: 'hospitality_event',
  },
  {
    id: 'healthcare',
    icon: '🏥',
    color: '#14b8a6',
    labelKeys: {
      milestones: 'projectTypes.healthcare.labels.milestones',
    },
    templateCategory: 'healthcare',
  },
  {
    id: 'retail_opening',
    icon: '🛒',
    color: '#84cc16',
    labelKeys: {
      milestones: 'projectTypes.retail_opening.labels.milestones',
    },
    templateCategory: 'retail_opening',
  },
  {
    id: 'manufacturing',
    icon: '🏭',
    color: '#64748b',
    labelKeys: {
      milestones: 'projectTypes.manufacturing.labels.milestones',
    },
    templateCategory: 'manufacturing',
  },
  {
    id: 'private_event',
    icon: '🎉',
    color: '#a855f7',
    labelKeys: {
      milestones: 'projectTypes.private_event.labels.milestones',
    },
    templateCategory: 'private_event',
  },
];

export const getPreset = (id?: string | null): ProjectTypePreset => {
  return (
    PROJECT_TYPE_PRESETS.find((p) => p.id === id) ??
    PROJECT_TYPE_PRESETS[0] // 'general' fallback
  );
};

export const isValidProjectType = (id: string): id is ProjectType =>
  PROJECT_TYPE_PRESETS.some((p) => p.id === id);
