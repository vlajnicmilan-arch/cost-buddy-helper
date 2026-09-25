import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { sanitizeTags, isMovementKind } from '@/lib/expenseMarkers';
import { TAG_ICONS } from './ExpenseMarkerFields';

/** Male ikone oznaka i oznaka vrste zapisa uz iznos na retku transakcije. */
export const ExpenseMarkerIcons = ({ tags, movementKind }: { tags?: readonly string[] | null; movementKind?: string | null }) => {
  const { t } = useTranslation();
  const clean = sanitizeTags(tags ?? []);
  const kind = isMovementKind(movementKind) ? movementKind : null;
  if (clean.length === 0 && !kind) return null;
  return (
    <span className="inline-flex items-center gap-1" data-testid="expense-marker-icons">
      {clean.map((tag) => {
        const Icon = TAG_ICONS[tag];
        const label = t(`categoryReview.tags.${tag}`);
        return <Icon key={tag} className="w-3 h-3 text-muted-foreground" aria-label={label} role="img" />;
      })}
      {kind && (
        <Badge variant="outline" className="text-[9px] py-0 px-1 h-4 shrink-0">
          {t(`categoryReview.movement.${kind}`)}
        </Badge>
      )}
    </span>
  );
};
