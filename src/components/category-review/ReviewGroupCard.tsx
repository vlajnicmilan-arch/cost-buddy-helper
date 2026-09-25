import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronUp, Pencil, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TreeCategoryOptions } from '@/components/categories/TreeCategoryOptions';
import type { ReviewGroup, ReviewProposal, ReviewRow } from '@/lib/categoryReviewSuggestions';
import { useCategoryLabel, useProposalLabel } from './ReviewCategoryLabel';

interface Props {
  group: ReviewGroup;
  customCategories: { id: string; name: string; icon: string | null; color: string | null; group_key: string | null }[];
  /** false = samo prikaz (lista „treba tvoju odluku"). */
  actionable: boolean;
  pending: boolean;
  onApply: (rows: ReviewRow[], proposal: ReviewProposal) => void;
  onSkip?: () => void;
  formatAmount: (n: number) => string;
}

const MAX_ROWS = 50;

export const ReviewGroupCard = ({ group, customCategories, actionable, pending, onApply, onSkip, formatAmount }: Props) => {
  const { t } = useTranslation();
  const catLabel = useCategoryLabel(customCategories);
  const proposalLabel = useProposalLabel(customCategories);
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState<string>('');

  const mode = group.rows[0]?.type === 'income' ? 'income' : 'expense';
  const chosen: ReviewProposal | null = picked
    ? { ...(group.proposal?.tags ? { tags: group.proposal.tags } : {}), category: picked }
    : group.proposal;

  return (
    <Card data-testid={`review-group-${group.section}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium truncate">{group.label}</p>
            <p className="text-xs text-muted-foreground">
              {t('categoryReview.countTotal', { count: group.rows.length, total: formatAmount(group.total) })}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">{t(`categoryReview.confidence.${group.confidence}`)}</Badge>
        </div>

        <p className="text-sm">
          <span className="text-muted-foreground">{t('categoryReview.now')}: </span>
          {catLabel(group.currentCategory)}
          {chosen && (
            <>
              <span className="text-muted-foreground"> → </span>
              <span className="font-medium text-primary">{proposalLabel(chosen)}</span>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{t(`categoryReview.reasons.${group.reason}`)}</p>

        {actionable && changing && (
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="h-11"><SelectValue placeholder={t('categoryReview.pickCategory')} /></SelectTrigger>
            <SelectContent className="z-[70]">
              <TreeCategoryOptions mode={mode} customCategories={customCategories} />
            </SelectContent>
          </Select>
        )}

        {actionable && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="min-h-11" disabled={!chosen || pending} onClick={() => chosen && onApply(group.rows, chosen)}>
              <Check className="w-4 h-4 mr-1" />{t('categoryReview.confirmAll', { count: group.rows.length })}
            </Button>
            <Button size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => setChanging((v) => !v)}>
              <Pencil className="w-4 h-4 mr-1" />{t('categoryReview.change')}
            </Button>
            {onSkip && (
              <Button size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={onSkip}>
                <SkipForward className="w-4 h-4 mr-1" />{t('categoryReview.skip')}
              </Button>
            )}
          </div>
        )}

        <Button variant="ghost" size="sm" className="min-h-11 px-0" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
          {t('categoryReview.examples')}
        </Button>
        {open && (
          <ul className="space-y-1">
            {group.rows.slice(0, MAX_ROWS).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-xs border-t pt-1">
                <span className="min-w-0 truncate">
                  {r.date ? new Date(r.date).toLocaleDateString() : ''} · {r.description || r.merchant_name}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {formatAmount(Math.abs(Number(r.amount) || 0))}
                  {actionable && chosen && (
                    <Button size="sm" variant="outline" className="h-9" disabled={pending} onClick={() => onApply([r], chosen)}>
                      <Check className="w-3 h-3" />
                    </Button>
                  )}
                </span>
              </li>
            ))}
            {group.rows.length > MAX_ROWS && (
              <li className="text-xs text-muted-foreground">{t('categoryReview.moreRows', { count: group.rows.length - MAX_ROWS })}</li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
