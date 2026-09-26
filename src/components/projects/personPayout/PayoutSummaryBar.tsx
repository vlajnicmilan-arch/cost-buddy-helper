import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { PayoutSummary } from '@/lib/personPayoutScope';

export const PayoutSummaryBar = ({ summary }: { summary: PayoutSummary }) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  return (
    <p
      data-testid="payout-summary"
      className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground"
    >
      {t('people.payout.summary', 'Isplaćuješ {{paying}} · Zarađeno {{earned}} · Ostaje {{remaining}}', {
        paying: formatAmount(summary.paying),
        earned: formatAmount(summary.earned),
        remaining: formatAmount(summary.remaining),
      })}
    </p>
  );
};
