/**
 * One row of the settlement history (extracted from KrugSettlementHistory).
 * Recipient actions (confirm / not received) appear only for the recipient
 * while the row awaits receipt; legacy rows render as before.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowRight, X } from 'lucide-react';
import type { KrugSettlementLedgerRow } from '@/hooks/useKrugSettlementMutations';
import { canActOnReceipt, isAwaitingReceipt } from '@/lib/krugSettleWithSource';

interface Props {
  row: KrugSettlementLedgerRow;
  userId: string | null | undefined;
  readOnly: boolean;
  voidPending: boolean;
  nameFor: (uid: string) => string;
  sourceNameFor: (id: string | null | undefined) => string | null;
  onVoid: (ledgerId: string) => void;
  onConfirmReceipt: (row: KrugSettlementLedgerRow) => void;
  onNotReceived: (ledgerId: string) => void;
}

export function KrugSettlementHistoryRow({
  row: r, userId, readOnly, voidPending, nameFor, sourceNameFor, onVoid, onConfirmReceipt, onNotReceived,
}: Props) {
  const { t } = useTranslation();
  const voided = !!r.voided_at;
  const paidFrom = r.payer_expense_id ? sourceNameFor(r.payer_source_id) : null;
  const receivedOn = r.recipient_confirmed_at ? sourceNameFor(r.recipient_source_id) : null;
  const recipientActions = canActOnReceipt(r, userId, readOnly);

  return (
    <div data-highlight-id={`settlement:${r.id}`} className="px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className={`min-w-0 flex-1 ${voided ? 'line-through opacity-60' : ''}`}>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="truncate">{nameFor(r.from_user)}</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate font-medium">{nameFor(r.to_user)}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {new Date(r.marked_at).toLocaleDateString()} · {r.note || t('krug.settle.history.noNote', 'bez napomene')}
          </div>
          {paidFrom && (
            <div className="text-[11px] text-muted-foreground">
              {t('krug.settle.history.paidFrom', { source: paidFrom })}
            </div>
          )}
          {isAwaitingReceipt(r) && (
            <div className="text-[11px] text-muted-foreground" data-testid="settle-awaiting-receipt">
              {t('krug.settle.history.awaitingReceipt')}
            </div>
          )}
          {r.recipient_confirmed_at && !voided && (
            <div className="text-[11px] text-muted-foreground" data-testid="settle-received">
              {receivedOn
                ? t('krug.settle.history.receivedOn', { source: receivedOn })
                : t('krug.settle.history.received')}
            </div>
          )}
          {voided && (
            <div className="text-[11px] text-destructive">
              {t('krug.settle.history.voidedLabel', 'Poništeno')}: {r.void_reason}
            </div>
          )}
        </div>
        <div className={`text-sm font-semibold tabular-nums shrink-0 ${voided ? 'line-through opacity-60' : ''}`}>
          {Number(r.amount).toFixed(2)} {r.currency}
        </div>
        {/* Poništenje je zaštita obiju strana duga. */}
        {!readOnly && !voided && !recipientActions && (userId === r.from_user || userId === r.to_user) && (
          <Button
            size="icon" variant="ghost" className="h-8 w-8 shrink-0"
            disabled={voidPending}
            onClick={() => onVoid(r.id)}
            aria-label={t('krug.settle.history.void', 'Poništi')}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {recipientActions && (
        <div className="flex gap-2 pt-2" data-testid="settle-recipient-actions">
          <Button size="sm" className="min-h-[44px] flex-1" onClick={() => onConfirmReceipt(r)}>
            {t('krug.settle.history.confirmReceipt')}
          </Button>
          <Button
            size="sm" variant="outline" className="min-h-[44px] flex-1"
            disabled={voidPending}
            onClick={() => onNotReceived(r.id)}
          >
            {t('krug.settle.history.notReceived')}
          </Button>
        </div>
      )}
    </div>
  );
}
