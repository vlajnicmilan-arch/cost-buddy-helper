import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import type { CollaboratorGroup } from '@/lib/collaboratorOverview';

interface CollaboratorDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: CollaboratorGroup | null;
}

/**
 * One collaborator across all their engagements. Read-only by design —
 * there is no payment ledger for collaborators, so nothing here writes.
 */
export const CollaboratorDetailDialog = ({ open, onOpenChange, group }: CollaboratorDetailDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  if (!group) return null;

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return t('collaboratorsFilters.statusCompleted', 'Završeni');
      case 'cancelled':
        return t('collaboratorsOverview.cancelled', 'Otkazan');
      default:
        return t('collaboratorsFilters.statusActive', 'Aktivni');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{group.displayName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('collaboratorsOverview.agreed', 'Dogovoreno')}</span>
            <span className="font-medium">
              {group.agreed === 0 && group.hasUnpriced
                ? t('collaboratorsOverview.noAmount', 'iznos nije upisan')
                : formatAmount(group.agreed)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('collaboratorsOverview.paid', 'Plaćeno')}</span>
            <span className="font-medium">{formatAmount(group.paid)}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {t('collaboratorsOverview.remaining', 'Ostaje')}
            </span>
            <span className="text-2xl font-bold text-primary">{formatAmount(group.remaining)}</span>
          </div>
          {group.hasUnpriced && group.agreed > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('collaboratorsOverview.someUnpriced', 'Neki angažmani nemaju upisan iznos.')}
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('collaboratorsOverview.engagementsTitle', 'Angažmani')}</p>
          {group.engagements.map((e) => (
            <div
              key={e.id}
              className={cn(
                'rounded-lg border border-border/50 p-3 space-y-1',
                e.isCancelled && 'opacity-60',
              )}
            >
              <p className="text-sm truncate">
                {[e.projectName || t('people.unknownProject', 'Projekt'), e.serviceDescription, statusLabel(e.status)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className={cn('font-medium', e.agreed === null && 'text-muted-foreground font-normal')}>
                  {e.agreed === null
                    ? t('collaboratorsOverview.noAmount', 'iznos nije upisan')
                    : formatAmount(e.agreed)}
                </span>
                <span className="text-muted-foreground">
                  {t('collaboratorsOverview.paidShort', 'plaćeno')} {formatAmount(e.paid)}
                </span>
              </div>
              {e.isCancelled && (
                <p className="text-[11px] text-muted-foreground">
                  {t('collaboratorsOverview.excludedFromTotals', 'Otkazan — izvan zbroja')}
                </p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
