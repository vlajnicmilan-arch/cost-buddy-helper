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

export type LabelKey = 'milestones' | 'workers' | 'collaborators' | 'documents' | 'members';

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
      collaborators: 'projectTypes.construction_new.labels.collaborators',
      documents: 'projectTypes.construction_new.labels.documents',
    },
    templateCategory: 'construction',
  },
  {
    id: 'renovation',
    icon: '🔨',
    color: '#ef4444',
    labelKeys: {
      milestones: 'projectTypes.renovation.labels.milestones',
      collaborators: 'projectTypes.renovation.labels.collaborators',
      documents: 'projectTypes.renovation.labels.documents',
    },
    templateCategory: 'renovation',
  },
  {
    id: 'interior',
    icon: '🛋️',
    color: '#ec4899',
    labelKeys: {
      milestones: 'projectTypes.interior.labels.milestones',
      collaborators: 'projectTypes.interior.labels.collaborators',
    },
    templateCategory: 'renovation',
  },
  {
    id: 'it_software',
    icon: '💻',
    color: '#06b6d4',
    labelKeys: {
      milestones: 'projectTypes.it_software.labels.milestones',
      workers: 'projectTypes.it_software.labels.workers',
      collaborators: 'projectTypes.it_software.labels.collaborators',
      documents: 'projectTypes.it_software.labels.documents',
    },
  },
  {
    id: 'marketing',
    icon: '📣',
    color: '#8b5cf6',
    labelKeys: {
      milestones: 'projectTypes.marketing.labels.milestones',
      collaborators: 'projectTypes.marketing.labels.collaborators',
      documents: 'projectTypes.marketing.labels.documents',
    },
  },
  {
    id: 'education',
    icon: '🎓',
    color: '#22c55e',
    labelKeys: {
      milestones: 'projectTypes.education.labels.milestones',
      workers: 'projectTypes.education.labels.workers',
      members: 'projectTypes.education.labels.members',
      documents: 'projectTypes.education.labels.documents',
    },
  },
  {
    id: 'beauty',
    icon: '💅',
    color: '#f472b6',
    labelKeys: {
      milestones: 'projectTypes.beauty.labels.milestones',
      workers: 'projectTypes.beauty.labels.workers',
      documents: 'projectTypes.beauty.labels.documents',
    },
  },
  {
    id: 'hospitality_event',
    icon: '🍽️',
    color: '#fb923c',
    labelKeys: {
      milestones: 'projectTypes.hospitality_event.labels.milestones',
      workers: 'projectTypes.hospitality_event.labels.workers',
      collaborators: 'projectTypes.hospitality_event.labels.collaborators',
      documents: 'projectTypes.hospitality_event.labels.documents',
    },
  },
  {
    id: 'healthcare',
    icon: '🏥',
    color: '#14b8a6',
    labelKeys: {
      milestones: 'projectTypes.healthcare.labels.milestones',
      workers: 'projectTypes.healthcare.labels.workers',
      documents: 'projectTypes.healthcare.labels.documents',
    },
  },
  {
    id: 'retail_opening',
    icon: '🛒',
    color: '#84cc16',
    labelKeys: {
      milestones: 'projectTypes.retail_opening.labels.milestones',
      collaborators: 'projectTypes.retail_opening.labels.collaborators',
      documents: 'projectTypes.retail_opening.labels.documents',
    },
  },
  {
    id: 'manufacturing',
    icon: '🏭',
    color: '#64748b',
    labelKeys: {
      milestones: 'projectTypes.manufacturing.labels.milestones',
      collaborators: 'projectTypes.manufacturing.labels.collaborators',
      documents: 'projectTypes.manufacturing.labels.documents',
    },
  },
  {
    id: 'private_event',
    icon: '🎉',
    color: '#a855f7',
    labelKeys: {
      milestones: 'projectTypes.private_event.labels.milestones',
      collaborators: 'projectTypes.private_event.labels.collaborators',
      documents: 'projectTypes.private_event.labels.documents',
    },
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
