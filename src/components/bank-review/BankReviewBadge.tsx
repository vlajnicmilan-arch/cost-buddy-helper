import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/** Mala značka uz stanje sinkronizacije računa: „Na pregled (N)". */
export function BankReviewBadge({ count, accountId }: { count: number; accountId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (count <= 0) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-8 px-2 text-xs"
      onClick={() => navigate(`/bank-sync/review?account=${encodeURIComponent(accountId)}`)}
    >
      {t('bankReview.badge', { count })}
    </Button>
  );
}
