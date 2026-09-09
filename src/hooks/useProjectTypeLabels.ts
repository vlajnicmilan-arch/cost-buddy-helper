import { useTranslation } from 'react-i18next';
import { Project } from '@/types/project';
import { getPreset, LabelKey } from '@/lib/projectTypes';

export interface ProjectTypeLabels {
  milestonesLabel: string;
  workersLabel: string;
  collaboratorsLabel: string;
  documentsLabel: string;
  membersLabel: string;
  /** Localized name of the project type itself, useful for read-only badges. */
  typeName: string;
}

type Translator = (key: string, fallback?: string) => string;

/**
 * Pure resolver — testable without React.
 *
 * Naming rule: only the milestones tab is renamed per project type.
 * People tabs (Members · People · Collaborators) and Documents are GLOBAL —
 * their names never depend on the project type.
 */
export const getProjectTypeLabels = (
  projectType: string | null | undefined,
  t: Translator,
  labelOverrides?: Partial<Record<LabelKey, string>> | null,
): ProjectTypeLabels => {
  const preset = getPreset(projectType);
  const overrides = (labelOverrides ?? {}) as Partial<Record<LabelKey, string>>;

  const resolveMilestones = (): string => {
    // 1. Per-project override (future-ready — currently never written)
    const override = overrides.milestones;
    if (override && override.trim().length > 0) return override;

    // 2. Preset i18n key
    const presetKey = preset.labelKeys.milestones;
    if (presetKey) {
      const translated = t(presetKey, '');
      if (typeof translated === 'string' && translated.trim().length > 0) return translated;
    }

    // 3. Global fallback
    return t('projects.milestones', 'Faze');
  };

  return {
    milestonesLabel: resolveMilestones(),
    workersLabel: t('projects.workers', 'Ljudi'),
    collaboratorsLabel: t('projects.collaborators', 'Suradnici'),
    documentsLabel: t('projects.documents.tab', 'Dokumenti'),
    membersLabel: t('projects.members', 'Članovi'),
    typeName: t(`projectTypes.${preset.id}.name`, preset.id),
  };
};

/**
 * React wrapper around `getProjectTypeLabels`.
 */
export const useProjectTypeLabels = (
  project?: Pick<Project, 'project_type' | 'label_overrides'> | null,
): ProjectTypeLabels => {
  const { t } = useTranslation();
  return getProjectTypeLabels(
    project?.project_type,
    t as Translator,
    (project?.label_overrides ?? null) as Partial<Record<LabelKey, string>> | null,
  );
};
