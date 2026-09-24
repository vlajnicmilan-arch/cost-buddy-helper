/**
 * Debtor settles a transfer from a chosen source (krug_mark_settled_with_source).
 * One client_request_id per dialog opening makes retries and double clicks
 * idempotent on the server; the 3s debounce against accidental confirm stays.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useKrugMarkSettledWithSource, useLatestKrugFxSnapshot } from '@/hooks/useKrugSettlementMutations';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import {
  canSubmitSettle, needsPayerAmount, parsePayerAmount, writableSettleSources,
} from '@/lib/krugSettleWithSource';
import { KrugSettleSourceFields } from './KrugSettleSourceFields';

interface Props {
  krugId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transfer: {
    fromUser: string;
    toUser: string;
    amount: number;
    currency: string;
    fromName: string;
    toName: string;
  } | null;
}

const DEBOUNCE_MS = 3000;

export function KrugSettleTransferDialog({ krugId, open, onOpenChange, transfer }: Props) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [payerAmount, setPayerAmount] = useState('');
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [debounceLeft, setDebounceLeft] = useState(0);
  // Synchronous lock: isPending only flips after a render, two clicks in the
  // same frame would otherwise both reach mutateAsync.
  const inFlight = useRef(false);
  const mut = useKrugMarkSettledWithSource(krugId);
  const { customPaymentSources, refetch: refetchSources } = useCustomPaymentSources({ allScopes: true });
  const sources = useMemo(() => writableSettleSources(customPaymentSources), [customPaymentSources]);
  const selected = sources.find((s) => s.id === sourceId) ?? null;
  const currency = transfer?.currency ?? 'EUR';
  const showPayerAmount = !!selected && needsPayerAmount(selected.currency, currency);
  const { data: fxSnapshot } = useLatestKrugFxSnapshot(krugId, open && showPayerAmount);

  useEffect(() => {
    if (!open) {
      setNote(''); setSourceId(null); setPayerAmount(''); setClientRequestId(null);
      setDebounceLeft(0); inFlight.current = false;
      return;
    }
    setClientRequestId(crypto.randomUUID());
    setDebounceLeft(DEBOUNCE_MS);
    const started = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, DEBOUNCE_MS - (Date.now() - started));
      setDebounceLeft(left);
      if (left === 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [open]);

  if (!transfer) return null;
  const ready = canSubmitSettle({
    sourceId, sourceCurrency: selected?.currency, settlementCurrency: currency, payerAmountRaw: payerAmount,
  });
  const disabled = !ready || !clientRequestId || debounceLeft > 0 || mut.isPending;

  const submit = async () => {
    if (inFlight.current || !ready || !sourceId || !clientRequestId) return;
    inFlight.current = true;
    try {
      await mut.mutateAsync({
        fromUser: transfer.fromUser,
        toUser: transfer.toUser,
        amount: transfer.amount,
        currency: transfer.currency,
        payerSourceId: sourceId,
        clientRequestId,
        payerAmount: showPayerAmount ? parsePayerAmount(payerAmount) : null,
        note: note.trim() || undefined,
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
          <DialogTitle>{t('krug.settle.dialog.titleSelf', 'Označi da si platio')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-sm">
            {t('krug.settle.dialog.bodySelf', 'Označavaš da si platio {{to}} iznos {{amount}} {{currency}}.', {
              to: transfer.toName,
              amount: transfer.amount.toFixed(2), currency: transfer.currency,
            })}
          </div>
          <KrugSettleSourceFields
            sources={sources}
            sourceId={sourceId}
            onSourceChange={(id) => { setSourceId(id); setPayerAmount(''); }}
            showPayerAmount={showPayerAmount}
            payerAmount={payerAmount}
            onPayerAmountChange={setPayerAmount}
            settlementAmount={transfer.amount}
            settlementCurrency={currency}
            sourceCurrency={selected?.currency ?? null}
            fxSnapshot={fxSnapshot}
            disabled={mut.isPending}
          />
          <div className="space-y-1.5">
            <Label htmlFor="settle-note" className="text-xs">
              {t('krug.settle.dialog.noteLabel', 'Napomena (opcionalno)')}
            </Label>
            <Input
              id="settle-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder={t('krug.settle.dialog.notePlaceholder', 'npr. gotovina 25.7.')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={submit} disabled={disabled} data-testid="settle-confirm">
            {mut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {debounceLeft > 0
              ? t('krug.settle.dialog.confirmCountdown', 'Potvrdi ({{s}}s)', { s: Math.ceil(debounceLeft / 1000) })
              : t('krug.settle.dialog.confirmSelf', 'Potvrdi da sam platio')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
