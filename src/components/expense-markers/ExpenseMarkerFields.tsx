import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Gem, Ban } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  EXPENSE_TAGS,
  type ExpenseTag,
  type MovementKind,
  movementKindsForType,
  toggleTag,
} from '@/lib/expenseMarkers';

export const TAG_ICONS: Record<ExpenseTag, typeof Ban> = { unnecessary: Ban, luxury: Gem };

interface ExpenseMarkerFieldsProps {
  type: string;
  tags: ExpenseTag[];
  onTagsChange: (tags: ExpenseTag[]) => void;
  movementKind: MovementKind | null;
  onMovementKindChange: (kind: MovementKind | null) => void;
}

/** Oznake (samo trošak) + neobavezna vrsta zapisa. Prijenos ne prikazuje ništa. */
export const ExpenseMarkerFields = ({
  type, tags, onTagsChange, movementKind, onMovementKindChange,
}: ExpenseMarkerFieldsProps) => {
  const { t } = useTranslation();
  const options = movementKindsForType(type);
  const [open, setOpen] = useState(movementKind !== null);
  if (type === 'transfer') return null;
  const foreignKind = movementKind !== null && !options.includes(movementKind);

  return (
    <div className="space-y-2" data-testid="expense-marker-fields">
      {type === 'expense' && (
        <div className="flex flex-wrap gap-2">
          {EXPENSE_TAGS.map((tag) => {
            const active = tags.includes(tag);
            const Icon = TAG_ICONS[tag];
            return (
              <Button
                key={tag}
                type="button"
                variant="outline"
                aria-pressed={active}
                data-testid={`tag-chip-${tag}`}
                onClick={() => onTagsChange(toggleTag(tags, tag))}
                className={cn('min-h-11 rounded-full gap-1.5', active && 'bg-primary/10 border-primary text-primary')}
              >
                <Icon className="w-4 h-4" />
                {t(`categoryReview.tags.${tag}`)}
              </Button>
            );
          })}
        </div>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="min-h-11 w-full justify-between px-2 text-sm text-muted-foreground">
            <span>{t('expenseMarkers.kindToggle')}</span>
            <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">{t('expenseMarkers.kindHint')}</p>
          <div className="flex flex-col gap-1.5" role="radiogroup">
            <Button
              type="button"
              variant="outline"
              role="radio"
              aria-checked={movementKind === null}
              onClick={() => onMovementKindChange(null)}
              className={cn('min-h-11 justify-start', movementKind === null && 'border-primary text-primary')}
            >
              {t('expenseMarkers.kindNone')}
            </Button>
            {options.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                role="radio"
                aria-checked={movementKind === kind}
                data-testid={`movement-kind-${kind}`}
                onClick={() => onMovementKindChange(kind)}
                className={cn('min-h-11 justify-start', movementKind === kind && 'border-primary text-primary bg-primary/10')}
              >
                {t(`categoryReview.movement.${kind}`)}
              </Button>
            ))}
            {foreignKind && (
              <p className="text-xs text-muted-foreground">
                {t('expenseMarkers.kindCurrent', { kind: t(`categoryReview.movement.${movementKind}`) })}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
