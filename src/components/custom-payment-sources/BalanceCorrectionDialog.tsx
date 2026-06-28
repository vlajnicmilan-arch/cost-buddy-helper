import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';

interface BalanceCorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  sourceName: string;
  onSave: (newBalance: number) => Promise<void>;
}

export const BalanceCorrectionDialog = ({
  open,
  onOpenChange,
  currentBalance,
  sourceName,
  onSave,
}: BalanceCorrectionDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [newBalance, setNewBalance] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNewBalance(currentBalance.toFixed(2));
    }
  }, [open, currentBalance]);

  const handleSave = async () => {
    const parsed = parseFloat(newBalance.replace(',', '.'));
    if (isNaN(parsed)) return;
    setSaving(true);
    try {
      await onSave(parsed);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const difference = parseFloat(newBalance.replace(',', '.')) - currentBalance;
  const isValid = !isNaN(parseFloat(newBalance.replace(',', '.')));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('paymentSources.correctBalance', 'Korigiraj saldo')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-muted-foreground text-xs">
              {t('paymentSources.currentBalance', 'Trenutni saldo')} — {sourceName}
            </Label>
            <p className={`font-mono font-bold text-lg ${currentBalance >= 0 ? 'text-income' : 'text-expense'}`}>
              {formatAmount(currentBalance)}
            </p>
          </div>
          <div>
            <Label htmlFor="new-balance">{t('paymentSources.newBalance', 'Novi saldo')}</Label>
            <Input
              id="new-balance"
              type="number"
              step="0.01"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              className="font-mono text-lg mt-1"
              autoFocus
            />
          </div>
          {isValid && difference !== 0 && (
            <p className="text-sm text-muted-foreground">
              {t('paymentSources.balanceDifference', 'Razlika')}:{' '}
              <span className={`font-mono font-semibold ${difference > 0 ? 'text-income' : 'text-expense'}`}>
                {difference > 0 ? '+' : ''}{formatAmount(difference)}
              </span>
            </p>
          )}
          <p className="text-xs text-muted-foreground border-t pt-3">
            {t('paymentSources.correctionHelper', 'Korekcija vrijedi za današnji dan. Novi unosi se zbrajaju od sutra.')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={handleSave} disabled={!isValid || saving}>
            {saving ? t('common.saving', 'Spremanje...') : t('common.save', 'Spremi')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
