import { useTranslation } from 'react-i18next';
import { Project } from '@/types/project';
import { getPreset, LabelKey } from '@/lib/projectTypes';

/**
 * Resolves localized tab labels for a project, with three priority layers:
 *   1. project.label_overrides (per-project user customization — reserved for future "Customize project" UI)
 *   2. preset.labelKeys (i18n keys defined for the project_type)
 *   3. global i18n fallback (existing project-wide translations)
 *
 * The hook is the single source of truth for tab labels — components must consume it
 * instead of hardcoding tab strings, so future overrides automatically propagate.
 */
export const useProjectTypeLabels = (
  project?: Pick<Project, 'project_type' | 'label_overrides'> | null,
) => {
  const { t } = useTranslation();
  const preset = getPreset(project?.project_type);
  const overrides = (project?.label_overrides ?? {}) as Partial<Record<LabelKey, string>>;

  const resolve = (key: LabelKey, fallbackKey: string, fallback: string): string => {
    // 1. Per-project override (future-ready — currently never written)
    const override = overrides[key];
    if (override && override.trim().length > 0) return override;

    // 2. Preset i18n key
    const presetKey = preset.labelKeys[key];
    if (presetKey) {
      const translated = t(presetKey, { defaultValue: '' });
      if (translated && translated.trim().length > 0) return translated;
    }

    // 3. Global fallback
    return t(fallbackKey, fallback);
  };

  return {
    milestonesLabel: resolve('milestones', 'projects.milestones', 'Faze'),
    workersLabel: resolve('workers', 'projects.workers.tab', 'Radnici'),
    collaboratorsLabel: resolve('collaborators', 'projects.collaborators.tab', 'Suradnici'),
    documentsLabel: resolve('documents', 'projects.documents.tab', 'Dokumenti'),
    membersLabel: resolve('members', 'projects.team', 'Tim'),
    /** Localized name of the project type itself, useful for read-only badges. */
    typeName: t(`projectTypes.${preset.id}.name`, preset.id),
  };
};
