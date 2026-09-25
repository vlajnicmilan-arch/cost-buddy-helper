import { useTranslation } from 'react-i18next';
import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';
import { CATEGORY_GROUPS, categoryGroupLabelKey } from '@/lib/categoryTree';
import { toGroupLimitKey } from '@/lib/categoryGroupMatch';

/** Filtar: cijela skupina (`group:<g>`) — listovi, stari ključevi i vlastite kategorije te skupine. */
export const CategoryGroupFilterOptions = () => {
  const { t } = useTranslation();
  return (
    <SelectGroup data-testid="filter-group-section">
      <SelectLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {t('budget.wholeGroupSection')}
      </SelectLabel>
      {CATEGORY_GROUPS.filter((g) => g.key !== 'income' && g.key !== 'other').map((g) => (
        <SelectItem key={g.key} value={toGroupLimitKey(g.key)} className="pl-6">
          <span className="flex items-center gap-2">
            <span>{g.icon}</span>
            <span>{t('budget.wholeGroup', { group: t(categoryGroupLabelKey(g.key)) })}</span>
          </span>
        </SelectItem>
      ))}
    </SelectGroup>
  );
};
