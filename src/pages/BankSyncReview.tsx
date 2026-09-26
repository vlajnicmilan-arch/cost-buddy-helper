import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReviewRowCard, type WalletOption } from '@/components/bank-review/ReviewRowCard';
import { useBankSyncReviewDecide, useBankSyncReviewQueue } from '@/hooks/useBankSyncReviewQueue';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { reviewErrorCode, type ReviewChoice, type ReviewQueueItem } from '@/lib/bankSyncReview/decision';

export default function BankSyncReview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const accountId = params.get('account');
  const { data, isLoading, error } = useBankSyncReviewQueue(accountId);
  const { customPaymentSources } = useCustomPaymentSources();
  const decide = useBankSyncReviewDecide();

  const wallets: WalletOption[] = useMemo(
    () => customPaymentSources.map((s) => ({ id: s.id, name: s.name })),
    [customPaymentSources],
  );

  const onDecide = (item: ReviewQueueItem, choice: ReviewChoice) => {
    const candidates = item.candidate_ids.map((id) => data?.candidates[id]).filter((c) => !!c);
    decide.mutate(
      { item, candidates: candidates as NonNullable<(typeof candidates)[number]>[], choice },
      {
        onSuccess: (r) =>
          showSuccess(t(r.status === 'already_decided' ? 'bankReview.alreadyDecided' : 'bankReview.decided')),
        onError: (e) => showError(t(`bankReview.errors.${reviewErrorCode(e)}`)),
      },
    );
  };

  const items = data?.items ?? [];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pt-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold">{t('bankReview.title', { count: items.length })}</h1>
      </div>
      <p className="text-xs text-muted-foreground">{t('bankReview.intro')}</p>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {error && <p className="text-sm text-destructive">{t('bankReview.errors.load')}</p>}
      {!isLoading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="review-empty">{t('bankReview.empty')}</p>
      )}

      {items.map((item) => (
        <ReviewRowCard
          key={item.id}
          item={item}
          candidates={item.candidate_ids.map((id) => data?.candidates[id]).filter((c): c is NonNullable<typeof c> => !!c)}
          wallets={wallets}
          busy={decide.isPending}
          onDecide={(choice) => onDecide(item, choice)}
        />
      ))}
    </div>
  );
}
