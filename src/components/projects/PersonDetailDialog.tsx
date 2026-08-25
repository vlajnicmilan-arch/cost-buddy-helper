import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Clock, Banknote, Wallet } from 'lucide-react';
import type { PersonAggregate } from '@/lib/workerIdentity';
import { PersonPayoutDialog } from './PersonPayoutDialog';

interface PersonDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId?: string | null;
  name: string;
  aggregate: PersonAggregate | null;
  projectNames: Record<string, string>;
  onPaid?: () => void;
}

/** Unified view of ONE person's hourly work across projects (+ payout action). */
export const PersonDetailDialog = ({
  open,
  onOpenChange,
  personId,
  name,
  aggregate,
  projectNames,
  onPaid,
}: PersonDetailDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [payoutOpen, setPayoutOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>

        {!aggregate ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border/50 p-2 text-center">
                <Banknote className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">{t('people.totalEarned', 'Ukupno zarađeno')}</p>
                <p className="text-sm font-semibold">{formatAmount(aggregate.totalEarned)}</p>
              </div>
              <div className="rounded-lg border border-border/50 p-2 text-center">
                <Wallet className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">{t('people.totalPaid', 'Ukupno isplaćeno')}</p>
                <p className="text-sm font-semibold">{formatAmount(aggregate.totalPaid)}</p>
              </div>
              <div className="rounded-lg border border-border/50 p-2 text-center">
                <Clock className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">{t('people.remaining', 'Ostaje za isplatu')}</p>
                <p className="text-sm font-semibold text-primary">{formatAmount(aggregate.totalRemaining)}</p>
              </div>
            </div>

            <Button
              className="w-full min-h-[44px]"
              disabled={aggregate.totalRemaining <= 0.005}
              onClick={() => setPayoutOpen(true)}
            >
              {t('people.payout.open', 'Isplati')}
            </Button>



            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t('people.perProject', 'Po projektu')}
              </p>
              <div className="space-y-2">
                {aggregate.byProject.map((b) => (
                  <div key={b.engagementId} className="rounded-lg border border-border/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {(b.projectId && projectNames[b.projectId]) || t('people.unknownProject', 'Projekt')}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {formatAmount(b.hourlyRate)}/h
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {b.hours} h · {t('people.earned', 'zarađeno')} {formatAmount(b.earned)}
                      </span>
                      <span className="text-primary">
                        {t('people.remainingShort', 'ostaje')} {formatAmount(b.remaining)}
                      </span>
                    </div>
                  </div>
                ))}
                {aggregate.byProject.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('people.noEngagements', 'Nema angažmana')}</p>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t('people.payoutHistory', 'Povijest isplata')}
              </p>
              {aggregate.payouts.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('people.noPayouts', 'Još nema isplata')}</p>
              ) : (
                <div className="space-y-1">
                  {aggregate.payouts.map((p, i) => (
                    <div key={`${p.worker_id}-${p.paid_at}-${i}`} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {new Date(p.paid_at).toLocaleDateString()} ·{' '}
                        {(p.project_id && projectNames[p.project_id]) || ''}
                      </span>
                      <span className="font-medium">{formatAmount(p.paid_amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
