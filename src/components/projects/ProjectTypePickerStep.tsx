import { useTranslation } from 'react-i18next';
import { ProjectType, PROJECT_TYPE_PRESETS } from '@/lib/projectTypes';
import { cn } from '@/lib/utils';

interface ProjectTypePickerStepProps {
  selectedId: ProjectType | null;
  onSelect: (id: ProjectType) => void;
}

export const ProjectTypePickerStep = ({ selectedId, onSelect }: ProjectTypePickerStepProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">
          {t('projectTypes.step.title', 'Za što ćeš koristiti ovaj projekt?')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            'projectTypes.step.subtitle',
            'Odaberi vrstu — prilagodit ćemo nazive faza i tabova. Vrsta se kasnije ne mijenja.',
          )}
        </p>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1"
        role="radiogroup"
        aria-label={t('projectTypes.step.title', 'Za što ćeš koristiti ovaj projekt?')}
      >
        {PROJECT_TYPE_PRESETS.map((preset) => {
          const selected = selectedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(preset.id)}
              className={cn(
                'min-h-[44px] p-3 rounded-xl border text-left transition-all',
                'flex flex-col gap-1',
                'hover:border-primary/50 hover:bg-muted/40',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary bg-primary/5 ring-2 ring-primary'
                  : 'border-border',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: `${preset.color}20` }}
                >
                  {preset.icon}
                </span>
                <span className="font-medium text-sm leading-tight truncate">
                  {t(`projectTypes.${preset.id}.name`, preset.id)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                {t(`projectTypes.${preset.id}.tagline`, '')}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
