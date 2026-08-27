import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Undo2, Wallet } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import type { CollaboratorGroup } from '@/lib/collaboratorOverview';
import {
  groupPaymentsForDisplay,
  remainingForCollaborator,
  type CollaboratorPaymentRow,
} from '@/lib/collaboratorPayment';
import { useCollaboratorPayments } from '@/hooks/useCollaboratorPayments';
import { ConfirmActionDialog } from '@/components/common/ConfirmActionDialog';
import {
  CollaboratorPaymentDialog,
  type CollaboratorPaymentTarget,
} from './CollaboratorPaymentDialog';

interface CollaboratorDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: CollaboratorGroup | null;
  onChanged?: () => void;
}

const failureKey = (code: string | null, message: string): string => {
  if (message.includes('collab_payment_exceeds_remaining')) return 'exceedsRemaining';
  if (message.includes('collab_payment_already_voided')) return 'alreadyVoided';
  if (code === '42501') return 'notOwner';
  if (code === '22023') return 'invalidInput';
  return 'generic';
};

/**
 * One collaborator across all their engagements, plus the real payment ledger.
 * Every write goes through the collaborator RPCs — the hourly-work path is
 * never touched here.
 */
export const CollaboratorDetailDialog = ({
  open,
  onOpenChange,
  group,
  onChanged,
}: CollaboratorDetailDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const collaboratorIds = useMemo(() => (group ? group.engagements.map((e) => e.id) : []), [group]);
  const { payments, submitting, createPayment, voidPayment, refetch } =
    useCollaboratorPayments(collaboratorIds);

  const [payOpen, setPayOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [toVoid, setToVoid] = useState<CollaboratorPaymentRow | null>(null);

  const paymentsByCollaborator = useMemo(() => {
    const map = new Map<string, CollaboratorPaymentRow[]>();
    for (const p of payments) {
      const arr = map.get(p.collaborator_id) ?? [];
      arr.push(p);
      map.set(p.collaborator_id, arr);
    }
    return map;
  }, [payments]);

  const targets: CollaboratorPaymentTarget[] = useMemo(() => {
    if (!group) return [];
    return group.engagements
      .filter((e) => !e.isCancelled)
      .map((e) => ({
        collaboratorId: e.id,
        projectId: e.projectId,
        projectName: e.projectName,
        serviceDescription: e.serviceDescription,
        remaining: remainingForCollaborator({
          totalPrice: e.agreed ?? 0,
          legacyPaid: e.legacyPaid,
          payments: paymentsByCollaborator.get(e.id) ?? [],
        }),
      }));
  }, [group, paymentsByCollaborator]);

  const display = useMemo(() => groupPaymentsForDisplay(payments), [payments]);

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

  const projectNameOf = (collaboratorId: string) =>
    group.engagements.find((e) => e.id === collaboratorId)?.projectName ?? '';

  const renderPayment = (p: CollaboratorPaymentRow) => {
    const voided = p.status !== 'paid' || !!p.voided_at;
    return (
      <div
        key={p.id}
        className={cn('flex items-start gap-2 rounded-lg border border-border/50 p-2.5', voided && 'opacity-60')}
      >
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', voided && 'line-through')}>
            {formatAmount(p.amount)}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {[new Date(p.paid_at).toLocaleDateString('hr-HR'), projectNameOf(p.collaborator_id)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {voided && p.void_reason && (
            <p className="text-[11px] text-muted-foreground">
              {t('collaboratorPayment.voidedReason', 'Stornirano: {{reason}}', { reason: p.void_reason })}
            </p>
          )}
        </div>
        {!voided && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setToVoid(p)}
          >
            <Undo2 className="w-4 h-4 mr-1" />
            {t('collaboratorPayment.void', 'Storniraj')}
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
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

          {targets.length > 0 && (
            <Button className="w-full min-h-[44px]" onClick={() => setPayOpen(true)}>
              <Wallet className="w-4 h-4 mr-1.5" />
              {t('collaboratorPayment.pay', 'Plati')}
            </Button>
          )}

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
                {e.legacyPaid > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('collaboratorPayment.legacyHint', 'Od toga {{amount}} upisano ručno, bez traga u novčaniku.', {
                      amount: formatAmount(e.legacyPaid),
                    })}
                  </p>
                )}
                {e.isCancelled && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('collaboratorsOverview.excludedFromTotals', 'Otkazan — izvan zbroja')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {(display.recent.length > 0 || display.voided.length > 0) && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t('collaboratorPayment.historyTitle', 'Povijest plaćanja')}
                </p>
                {display.recent.map(renderPayment)}

                {display.olderCount > 0 && !showAll && (
                  <Button variant="ghost" className="w-full min-h-[44px]" onClick={() => setShowAll(true)}>
                    {t('collaboratorPayment.showAll', 'Prikaži sve ({{count}})', {
                      count: display.olderCount,
                    })}
                  </Button>
                )}

                {showAll &&
                  display.months.map((m) => (
                    <div key={m.key} className="space-y-1.5">
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {m.monthDate.toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' })}
                        </span>
                        <span className="text-xs font-medium">{formatAmount(m.total)}</span>
                      </div>
                      {m.payments.map(renderPayment)}
                    </div>
                  ))}

                {display.voided.length > 0 && (
                  <Button
                    variant="ghost"
                    className="w-full min-h-[44px] text-xs text-muted-foreground"
                    onClick={() => setShowVoided((v) => !v)}
                  >
                    {showVoided
                      ? t('collaboratorPayment.hideVoided', 'Sakrij stornirana')
                      : t('collaboratorPayment.showVoided', '+ {{count}} storniranih', {
                          count: display.voided.length,
                        })}
                  </Button>
                )}
                {showVoided && display.voided.map(renderPayment)}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CollaboratorPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        displayName={group.displayName}
        targets={targets}
        submitting={submitting}
        onSubmit={async ({ target, amount, paidAt, paymentSource, note }) => {
          const res = await createPayment({
            collaboratorId: target.collaboratorId,
            projectId: target.projectId,
            amount,
            paymentSource,
            paidAt,
            note,
          });
          if (res.ok) {
            showSuccess(t('collaboratorPayment.paid', 'Plaćanje zabilježeno'));
            setPayOpen(false);
            onChanged?.();
          } else {
            showError(
              t(
                `collaboratorPayment.error.${failureKey(res.code, res.message)}`,
                res.message,
              ),
            );
          }
        }}
      />

      <ConfirmActionDialog
        open={!!toVoid}
        onOpenChange={(o) => !o && setToVoid(null)}
        title={t('collaboratorPayment.voidTitle', 'Storniraj plaćanje?')}
        description={t(
          'collaboratorPayment.voidDescription',
          'Trošak se poništava, a iznos se vraća u ostatak duga.',
        )}
        reason={{
          label: t('collaboratorPayment.voidReasonLabel', 'Razlog storniranja'),
          required: true,
        }}
        confirmLabel={t('collaboratorPayment.void', 'Storniraj')}
        destructive
        pending={submitting}
        onConfirm={async (reason) => {
          if (!toVoid) return;
          const res = await voidPayment(toVoid, reason ?? '');
          setToVoid(null);
          if (res.ok) {
            showSuccess(t('collaboratorPayment.voided', 'Plaćanje stornirano'));
            await refetch();
            onChanged?.();
          } else {
            showError(
              t(
                `collaboratorPayment.error.${failureKey(res.code, res.message)}`,
                res.message,
              ),
            );
          }
        }}
      />
    </>
  );
};
