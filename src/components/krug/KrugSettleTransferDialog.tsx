/**
 * Podmirenje transfera (Faza B). Confirm dijalog s 3s debounceom da spriječi
 * dvostruki klik.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useKrugMarkSettled } from '@/hooks/useKrugSettlementMutations';

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
  const [debounceLeft, setDebounceLeft] = useState(0);
  const mut = useKrugMarkSettled(krugId);

  useEffect(() => {
    if (!open) { setNote(''); setDebounceLeft(0); return; }
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
  const disabled = debounceLeft > 0 || mut.isPending;

  const submit = async () => {
    try {
      await mut.mutateAsync({
        fromUser: transfer.fromUser,
        toUser: transfer.toUser,
        amount: transfer.amount,
        currency: transfer.currency,
        note: note.trim() || undefined,
      });
      onOpenChange(false);
    } catch { /* handled */ }
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
          <Button onClick={submit} disabled={disabled}>
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
