import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCategoryReviewApply, useCategoryReviewData, useCategoryReviewRevert } from '@/hooks/useCategoryReview';
import { ReviewGroupCard } from '@/components/category-review/ReviewGroupCard';
import { ReviewHistoryList } from '@/components/category-review/ReviewHistoryList';
import type { ReviewGroup, ReviewProposal, ReviewRow } from '@/lib/categoryReviewSuggestions';

const LIMIT = 60;

const CategoryReview = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { review, history, customCategories, isLoading, error } = useCategoryReviewData();
  const apply = useCategoryReviewApply();
  const revert = useCategoryReviewRevert();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const fmt = useMemo(() => {
    const nf = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR' });
    return (n: number) => nf.format(n);
  }, [i18n.language]);

  const onApply = (rows: ReviewRow[], proposal: ReviewProposal) =>
    apply.mutate({ rows, proposal, clientRequestId: crypto.randomUUID() });

  const renderList = (groups: ReviewGroup[], actionable: boolean, skippable: boolean) => {
    const visible = groups.filter((g) => !skipped.has(g.key));
    if (!visible.length) return <p className="text-sm text-muted-foreground py-4">{t('categoryReview.empty')}</p>;
    return (
      <div className="space-y-3">
        {visible.slice(0, LIMIT).map((g) => (
          <ReviewGroupCard
            key={g.key}
            group={g}
            customCategories={customCategories}
            actionable={actionable}
            pending={apply.isPending}
            onApply={onApply}
            onSkip={skippable ? () => setSkipped((s) => new Set(s).add(g.key)) : undefined}
            formatAmount={fmt}
          />
        ))}
        {visible.length > LIMIT && (
          <p className="text-xs text-muted-foreground">{t('categoryReview.moreGroups', { count: visible.length - LIMIT })}</p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-background pb-[calc(var(--bottom-nav-h)+1rem)]">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-3 py-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="font-semibold truncate">{t('categoryReview.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('categoryReview.subtitle')}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-3">
        {isLoading && <Loader2 className="w-6 h-6 animate-spin mx-auto my-8 text-muted-foreground" />}
        {error && <p className="text-sm text-destructive">{t('categoryReview.loadError')}</p>}
        {review && (
          <Tabs defaultValue="suggestions">
            <TabsList className="w-full grid grid-cols-4 h-auto">
              <TabsTrigger value="suggestions" className="min-h-11 text-xs">{t('categoryReview.tabs.suggestions', { count: review.pendingCount })}</TabsTrigger>
              <TabsTrigger value="manual" className="min-h-11 text-xs">{t('categoryReview.tabs.manual')}</TabsTrigger>
              <TabsTrigger value="decision" className="min-h-11 text-xs">{t('categoryReview.tabs.decision')}</TabsTrigger>
              <TabsTrigger value="history" className="min-h-11 text-xs">{t('categoryReview.tabs.history')}</TabsTrigger>
            </TabsList>
            <TabsContent value="suggestions">{renderList(review.suggestions, true, true)}</TabsContent>
            <TabsContent value="manual" className="space-y-4">
              <p className="text-xs text-muted-foreground">{t('categoryReview.manualHint')}</p>
              {renderList([...review.broken, ...review.unmatched], true, true)}
            </TabsContent>
            <TabsContent value="decision" className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('categoryReview.decisionHint')}</p>
              {renderList(review.needsDecision, false, false)}
            </TabsContent>
            <TabsContent value="history">
              <ReviewHistoryList entries={history} customCategories={customCategories} pending={revert.isPending} onRevert={(ids) => revert.mutate(ids)} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default CategoryReview;
