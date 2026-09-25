import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Tags } from 'lucide-react';
import { clickableProps } from '@/lib/a11y';
import { useCategoryReviewData } from '@/hooks/useCategoryReview';

/** Kartica „N zapisa čeka razvrstavanje" na početnoj. Bez obavijesti. */
export const CategoryReviewCard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { review } = useCategoryReviewData();
  if (!review || review.pendingCount === 0) return null;
  const open = () => navigate('/kategorije/pregled');
  return (
    <div
      {...clickableProps(open)}
      data-testid="category-review-card"
      className="mb-4 flex items-center gap-3 rounded-lg border border-l-4 border-l-primary bg-primary/5 p-3 min-h-11 cursor-pointer"
    >
      <Tags className="w-5 h-5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t('categoryReview.cardTitle', { count: review.pendingCount })}</p>
        <p className="text-xs text-muted-foreground">{t('categoryReview.cardBody')}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  );
};
