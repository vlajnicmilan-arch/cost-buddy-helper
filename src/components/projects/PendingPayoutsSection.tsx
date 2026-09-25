/**
 * „Isplate na čekanju" inside „Moja zarada na projektu". A tap opens the
 * shared AttributionSheet (confirm into a wallet, or „Nisam primio").
 */
import { useTranslation } from 'react-i18next';
import { ChevronRight, Hourglass } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { dispatchAttributionOpen } from '@/lib/attribution/events';
import { groupPendingPayouts, useMyPendingPayouts } from '@/hooks/useMyPendingPayouts';

interface Props {
  projectId: string;
}

export function PendingPayoutsSection({ projectId }: Props) {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { data } = useMyPendingPayouts(true);
  const items = groupPendingPayouts(data ?? [], projectId);

  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5 pt-1" data-testid="pending-payouts">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Hourglass className="w-3.5 h-3.5 text-primary" />
        {t('workLog.myPay.pending.title')}
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() =>
            dispatchAttributionOpen({
              action: 'created',
              payoutIds: item.payoutIds,
              batchId: item.batchId,
              projectNames: item.projectNames,
              paidAmountTotal: item.amount,
            })
          }
          className="w-full min-h-[44px] rounded-md border bg-background px-3 py-2 text-left flex items-center gap-2 hover:bg-muted/40"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{formatAmount(item.amount)}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {item.paidAt ? `${new Date(item.paidAt).toLocaleDateString()} · ` : ''}
              {t('workLog.myPay.pending.hint')}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}
