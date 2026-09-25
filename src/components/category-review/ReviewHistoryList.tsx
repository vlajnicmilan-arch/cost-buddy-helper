import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReviewHistoryEntry } from '@/hooks/useCategoryReview';
import { useCategoryLabel } from './ReviewCategoryLabel';

interface Props {
  entries: ReviewHistoryEntry[];
  customCategories: { id: string; name: string }[];
  pending: boolean;
  onRevert: (ids: string[]) => void;
}

const describe = (
  e: ReviewHistoryEntry,
  cat: (v: string) => string,
  t: (k: string) => string,
): string => {
  const parts: string[] = [];
  if (e.original_category !== e.corrected_category) parts.push(`${cat(e.original_category)} → ${cat(e.corrected_category)}`);
  if ((e.original_movement_kind ?? null) !== (e.corrected_movement_kind ?? null)) {
    parts.push(e.corrected_movement_kind ? t(`categoryReview.movement.${e.corrected_movement_kind}`) : '—');
  }
  if ((e.corrected_tags ?? []).join() !== (e.original_tags ?? []).join()) {
    parts.push((e.corrected_tags ?? []).map((tg) => t(`categoryReview.tags.${tg}`)).join(', ') || '—');
  }
  return parts.join(' · ');
};

export const ReviewHistoryList = ({ entries, customCategories, pending, onRevert }: Props) => {
  const { t } = useTranslation();
  const cat = useCategoryLabel(customCategories);
  if (!entries.length) return <p className="text-sm text-muted-foreground">{t('categoryReview.historyEmpty')}</p>;
  return (
    <ul className="space-y-2">
      {entries.slice(0, 200).map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-2 border rounded-lg p-2">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{e.merchant_name || e.description || '—'}</p>
            <p className="text-xs text-muted-foreground">{describe(e, cat, t)}</p>
            {e.reverted_at && <p className="text-xs text-muted-foreground">{t('categoryReview.revertedLabel')}</p>}
          </div>
          {!e.reverted_at && (
            <Button size="sm" variant="outline" className="min-h-11 shrink-0" disabled={pending} onClick={() => onRevert([e.id])}>
              <Undo2 className="w-4 h-4 mr-1" />{t('categoryReview.undo')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
};
