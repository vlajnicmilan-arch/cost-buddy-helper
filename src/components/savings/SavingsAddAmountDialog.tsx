import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SavingsAddAmountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalName: string;
  onAdd: (amount: number) => void;
}

export const SavingsAddAmountDialog = ({ open, onOpenChange, goalName, onAdd }: SavingsAddAmountDialogProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (val > 0) {
      onAdd(val);
      setAmount('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('savingsGoals.addTo', { name: goalName })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>{t('savingsGoals.amount')} ({currency.symbol})</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              required
            />
          </div>
          <Button type="submit" className="w-full">
            {t('savingsGoals.addAmount')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
