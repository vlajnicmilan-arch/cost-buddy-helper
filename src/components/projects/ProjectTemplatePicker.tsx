import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectTemplate, useProjectTemplates } from '@/hooks/useProjectTemplates';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectTemplatePickerProps {
  selectedId: string | null;
  onSelect: (template: ProjectTemplate | null) => void;
  /**
   * Optional category filter. When provided, only templates with matching
   * `category` (plus the universal "general" category) are shown.
   * The parent decides whether to auto-select the first match.
   */
  categoryFilter?: string;
}

export const ProjectTemplatePicker = ({ selectedId, onSelect, categoryFilter }: ProjectTemplatePickerProps) => {
  const { t } = useTranslation();
  const { templates, loading } = useProjectTemplates();

  // STRICT match only — no "general" fallback. If the project type has no
  // templateCategory, the picker is not rendered at all (parent decides).
  const filtered = useMemo(() => {
    if (!categoryFilter) return [];
    return templates.filter((tpl) => tpl.category === categoryFilter);
  }, [templates, categoryFilter]);

  if (!categoryFilter) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-primary" />
          {t('projects.templates.suggestedPhases', 'Predložene faze za ovu vrstu projekta (opcionalno)')}
        </p>
        {selectedId && (
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onSelect(null)}>
            {t('common.clear', 'Očisti')}
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {t('projects.templates.help', 'Šablona daje samo početni popis faza koje kasnije možeš mijenjati. Ne mijenja vrstu projekta.')}
      </p>

      {filtered.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic p-2 rounded border border-dashed">
          {t('projects.templates.empty', 'Za ovu vrstu projekta još nemamo predložene faze. Možeš ih unijeti ručno ili dodati kasnije.')}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto">
        {filtered.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onSelect(tpl)}
            className={cn(
              'p-2 rounded-lg border text-left transition-all hover:border-primary/50',
              selectedId === tpl.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{tpl.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{tpl.name}</p>
                {tpl.default_milestones?.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {tpl.default_milestones.length} {t('projects.templates.phases', 'faza')}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
