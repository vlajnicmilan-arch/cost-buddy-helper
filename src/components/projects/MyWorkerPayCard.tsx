import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet, Clock, Coins } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

interface MyWorkerPayCardProps {
  hourlyRate: number;
  hours: number;
  periodLabel: string;
}

export const MyWorkerPayCard = ({ hourlyRate, hours, periodLabel }: MyWorkerPayCardProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const hasRate = hourlyRate > 0;
  const payout = hours * hourlyRate;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Wallet className="w-3.5 h-3.5" />
          {t('workLog.myPay.title', 'Moja zarada na projektu')}
          <span className="text-muted-foreground font-normal">· {periodLabel}</span>
        </div>

        {hasRate ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {t('workLog.myPay.hourlyRate', 'Satnica')}
              </p>
              <p className="text-sm font-semibold">{formatAmount(hourlyRate)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {t('workLog.myPay.hoursInPeriod', 'Sati')}
              </p>
              <p className="text-sm font-semibold">{hours.toFixed(1)}h</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {t('workLog.myPay.payout', 'Za isplatu')}
              </p>
              <p className="text-sm font-bold text-primary">{formatAmount(payout)}</p>
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
