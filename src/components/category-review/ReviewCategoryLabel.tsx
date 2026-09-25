import { useTranslation } from 'react-i18next';
import { resolveTreeCategory, categoryGroupLabelKey } from '@/lib/categoryTree';
import type { ReviewProposal } from '@/lib/categoryReviewSuggestions';

interface Custom { id: string; name: string }

/** Naziv vrijednosti category: „Skupina › List", korisnička ili „nerazvrstano". */
export const useCategoryLabel = (customCategories: Custom[]) => {
  const { t } = useTranslation();
  return (value: string | null | undefined): string => {
    const r = resolveTreeCategory(value, customCategories);
    if (r.isCustom) return r.customName ?? '';
    if (r.invalid) return value ? `${t('categoryTree.unsorted')} („${value}")` : t('categoryTree.unsorted');
    if (!r.label) return value ?? '';
    const leaf = t(r.label);
    if (r.groupKey && r.leafKey) return `${t(categoryGroupLabelKey(r.groupKey))} › ${leaf}`;
    return r.unsorted ? `${leaf} · ${t('categoryTree.unsorted')}` : leaf;
  };
};

export const useProposalLabel = (customCategories: Custom[]) => {
  const { t } = useTranslation();
  const catLabel = useCategoryLabel(customCategories);
  return (p: ReviewProposal | null): string => {
    if (!p) return '';
    const parts: string[] = [];
    if (p.category) parts.push(catLabel(p.category));
    if (p.movement_kind) parts.push(t(`categoryReview.movement.${p.movement_kind}`));
    if (p.tags?.length) parts.push(p.tags.map((tg) => t(`categoryReview.tags.${tg}`)).join(', '));
    return parts.join(' + ');
  };
};
