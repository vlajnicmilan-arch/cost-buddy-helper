import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { categoryGroupLabelKey } from '@/lib/categoryTree';
import { EXPENSE_GROUP_KEYS, MINE_GROUP_LABEL_KEY } from '@/lib/categoryTreeOptions';

const MINE = '__mine__';

/** Izbor skupine za vlastitu kategoriju troška; NULL = „Moje kategorije". */
export const CategoryGroupSelect = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (groupKey: string | null) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{t('categoryTree.moveTo')}</Label>
      <Select value={value ?? MINE} onValueChange={(v) => onChange(v === MINE ? null : v)}>
        <SelectTrigger className="h-10 rounded-lg" aria-label={t('categoryTree.moveTo')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[100]">
          <SelectItem value={MINE}>{t(MINE_GROUP_LABEL_KEY)}</SelectItem>
          {EXPENSE_GROUP_KEYS.map((g) => (
            <SelectItem key={g} value={g}>{t(categoryGroupLabelKey(g))}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
