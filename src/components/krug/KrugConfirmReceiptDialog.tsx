/**
 * Recipient confirms where a settlement arrived (krug_confirm_settlement_receipt).
 * Mirrors the debtor dialog: mandatory writable source, paid amount when the
 * source currency differs, one client_request_id per opening, locked while pending.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useKrugConfirmSettlementReceipt, useLatestKrugFxSnapshot } from '@/hooks/useKrugSettlementMutations';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import {
  canSubmitSettle, needsPayerAmount, parsePayerAmount, writableSettleSources,
} from '@/lib/krugSettleWithSource';
import { KrugSettleSourceFields } from './KrugSettleSourceFields';

export interface ConfirmReceiptTarget {
  ledgerId: string;
  amount: number;
  currency: string;
  fromName: string;
}

interface Props {
  krugId: string;
  target: ConfirmReceiptTarget | null;
  onOpenChange: (v: boolean) => void;
}

export function KrugConfirmReceiptDialog({ krugId, target, onOpenChange }: Props) {
  const { t } = useTranslation();
  const open = !!target;
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [amountRaw, setAmountRaw] = useState('');
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mut = useKrugConfirmSettlementReceipt(krugId);
  const { customPaymentSources, refetch: refetchSources } = useCustomPaymentSources({ allScopes: true });
  const sources = useMemo(() => writableSettleSources(customPaymentSources), [customPaymentSources]);
  const selected = sources.find((s) => s.id === sourceId) ?? null;
  const currency = target?.currency ?? 'EUR';
  const showAmount = !!selected && needsPayerAmount(selected.currency, currency);
  const { data: fxSnapshot } = useLatestKrugFxSnapshot(krugId, open && showAmount);

  useEffect(() => {
    if (!open) {
      setSourceId(null); setAmountRaw(''); setClientRequestId(null); inFlight.current = false;
      return;
    }
    setClientRequestId(crypto.randomUUID());
  }, [open, target?.ledgerId]);

  if (!target) return null;
  const ready = canSubmitSettle({
    sourceId, sourceCurrency: selected?.currency, settlementCurrency: currency, payerAmountRaw: amountRaw,
  });
  const disabled = !ready || !clientRequestId || mut.isPending;

  const submit = async () => {
    if (inFlight.current || !ready || !sourceId || !clientRequestId) return;
    inFlight.current = true;
    try {
      await mut.mutateAsync({
        ledgerId: target.ledgerId,
        recipientSourceId: sourceId,
        clientRequestId,
        recipientAmount: showAmount ? parsePayerAmount(amountRaw) : null,
      });
      refetchSources();
      onOpenChange(false);
    } catch { /* reported in the mutation */ } finally {
      inFlight.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] max-w-md">
        <DialogHeader>
          <DialogTitle>{t('krug.settle.confirm.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-sm">
            {t('krug.settle.confirm.body', {
              from: target.fromName, amount: target.amount.toFixed(2), currency: target.currency,
            })}
          </div>
          <KrugSettleSourceFields
            sources={sources}
            sourceId={sourceId}
            onSourceChange={(id) => { setSourceId(id); setAmountRaw(''); }}
            showPayerAmount={showAmount}
            payerAmount={amountRaw}
            onPayerAmountChange={setAmountRaw}
            settlementAmount={target.amount}
            settlementCurrency={currency}
            sourceCurrency={selected?.currency ?? null}
            fxSnapshot={fxSnapshot}
            disabled={mut.isPending}
            sourceLabelKey="krug.settle.confirm.sourceLabel"
            amountLabelKey="krug.settle.confirm.receivedAmountLabel"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={submit} disabled={disabled} data-testid="receipt-confirm">
            {mut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('krug.settle.confirm.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
