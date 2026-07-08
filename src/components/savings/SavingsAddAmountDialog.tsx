import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { parseLocaleAmount } from '@/lib/money';

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
    const parsed = parseLocaleAmount(amount);
    if (parsed.valid && parsed.value > 0) {
      onAdd(parsed.value);
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
            <MoneyInput
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
