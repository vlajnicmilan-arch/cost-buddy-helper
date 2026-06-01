import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { MemberTally } from '@/hooks/useFamilyBudgetTally';

interface Props {
  tally: MemberTally[] | undefined;
  total: number;
}

const MAX_VISIBLE = 3;

export const FamilyBudgetTallyRow = ({ tally, total }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  if (!tally || tally.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {t('family.tally.noSpend')} · {t('family.tally.ofTotal', { total: formatAmount(total) })}
      </p>
    );
  }

  const visible = tally.slice(0, MAX_VISIBLE);
  const rest = tally.length - visible.length;

  return (
    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
      {visible
        .map((m) => `${m.display_name} ${formatAmount(m.amount)}`)
        .join(', ')}
      {rest > 0 && `, ${t('family.tally.others', { count: rest })}`}
      {' · '}
      {t('family.tally.ofTotal', { total: formatAmount(total) })}
    </p>
  );
};
