import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet, Clock, Coins, Loader2 } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useWorkerEarningsPreview } from '@/hooks/useWorkerEarningsPreview';

interface MyWorkerPayCardProps {
  /**
   * Linked worker's id in project_workers, or null when the current user is
   * NOT yet linked to a worker on this project.
   */
  workerId: string | null;
  projectId: string;
  /**
   * Fallback hourly rate for display when the RPC preview is unavailable
   * (network, permission) OR when hourlyRate itself is 0 (no rate set).
   * Also used to detect "worker linked but no rate" state.
   */
  hourlyRate: number | null;
  periodStart: string | null; // ISO date; null == show "not linked / no period"
  periodEnd: string | null;
  periodLabel: string;
}

/**
 * "Moja zarada na projektu" — historijski točan prikaz (per-day rate_at)
 * preko `preview_worker_earnings` RPC-a. Ako RPC ne uspije ili radnik nema
 * satnicu, prikazuje odgovarajuće stanje bez rušenja UI-ja.
 */
export const MyWorkerPayCard = ({
  workerId,
  projectId,
  hourlyRate,
  periodStart,
  periodEnd,
  periodLabel,
}: MyWorkerPayCardProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const isLinked = workerId !== null && hourlyRate !== null;
  const hasRate = isLinked && (hourlyRate as number) > 0;

  const { data, loading } = useWorkerEarningsPreview(
    hasRate ? workerId : null,
    projectId,
    hasRate ? periodStart : null,
    hasRate ? periodEnd : null,
  );

  const hours = data?.hours ?? 0;
  const payout = data?.gross ?? 0;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Wallet className="w-3.5 h-3.5" />
          {t('workLog.myPay.title', 'Moja zarada na projektu')}
          {isLinked && (
            <span className="text-muted-foreground font-normal">· {periodLabel}</span>
          )}
        </div>

        {!isLinked ? (
          <p className="text-xs text-muted-foreground">
            {t(
              'workLog.myPay.notLinkedYet',
              'Vlasnik te još nije dodao kao radnika na ovom projektu. Zarada će se prikazati nakon što ti postavi satnicu.',
            )}
          </p>
        ) : hasRate ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {t('workLog.myPay.hourlyRate', 'Satnica')}
              </p>
              <p className="text-sm font-semibold">{formatAmount(hourlyRate as number)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {t('workLog.myPay.hoursInPeriod', 'Sati')}
              </p>
              <p className="text-sm font-semibold">
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin inline" />
                ) : (
                  `${hours.toFixed(1)}h`
                )}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {t('workLog.myPay.payout', 'Za isplatu')}
              </p>
              <p className="text-sm font-bold text-primary">
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin inline" />
                ) : (
                  formatAmount(payout)
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('workLog.myPay.noRateSet', 'Vlasnik projekta još nije postavio satnicu.')}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
