import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TreeCategoryOptions } from '@/components/categories/TreeCategoryOptions';
import { CATEGORY_GROUPS, categoryGroupLabelKey } from '@/lib/categoryTree';
import { toGroupLimitKey } from '@/lib/categoryGroupMatch';
import type { TreeOptionCustom } from '@/lib/categoryTreeOptions';

interface Props {
  value: string;
  used: string[];
  customCategories: TreeOptionCustom[];
  onChange: (value: string) => void;
}

/** Limit budžeta: cijela skupina (`group:<g>`) ili jedan list / vlastita kategorija. */
export const BudgetLimitCategorySelect = ({ value, used, customCategories, onChange }: Props) => {
  const { t } = useTranslation();
  const groups = CATEGORY_GROUPS.filter((g) => g.key !== 'income');
  return (
    <Select
      value={value}
      onValueChange={(v) => { if (v === value || !used.includes(v)) onChange(v); }}
    >
      <SelectTrigger className="flex-1 min-h-[44px]">
        <SelectValue placeholder={t('common.selectCategory', 'Odaberi kategoriju')} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup data-testid="budget-limit-groups">
          <SelectLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('budget.wholeGroupSection')}
          </SelectLabel>
          {groups.map((g) => {
            const v = toGroupLimitKey(g.key);
            return (
              <SelectItem key={v} value={v} disabled={v !== value && used.includes(v)} className="pl-6">
                <span className="flex items-center gap-2">
                  <span>{g.icon}</span>
                  <span>{t('budget.wholeGroup', { group: t(categoryGroupLabelKey(g.key)) })}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectGroup>
        <TreeCategoryOptions mode="expense" customCategories={customCategories} currentValue={value || null} />
      </SelectContent>
    </Select>
  );
};
