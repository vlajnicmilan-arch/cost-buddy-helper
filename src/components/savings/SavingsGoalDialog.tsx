import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SavingsGoal } from '@/hooks/useSavingsGoals';

interface SavingsGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (goal: Omit<SavingsGoal, 'id' | 'created_at' | 'user_id' | 'is_completed' | 'completed_at'>) => void;
  editGoal?: SavingsGoal | null;
}

const ICONS = ['🎯', '🏠', '✈️', '🚗', '📱', '💻', '🎓', '💍', '🏖️', '💰', '🎁', '⚽'];

export const SavingsGoalDialog = ({ open, onOpenChange, onSave, editGoal }: SavingsGoalDialogProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();

  const [name, setName] = useState(editGoal?.name || '');
  const [targetAmount, setTargetAmount] = useState(editGoal?.target_amount?.toString() || '');
  const [currentAmount, setCurrentAmount] = useState(editGoal?.current_amount?.toString() || '0');
  const [icon, setIcon] = useState(editGoal?.icon || '🎯');
  const [color, setColor] = useState(editGoal?.color || '#22c55e');
  const [targetDate, setTargetDate] = useState(editGoal?.target_date || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetAmount) return;

    onSave({
      name: name.trim(),
      description: null,
      icon,
      color,
      target_amount: parseFloat(targetAmount),
      current_amount: parseFloat(currentAmount) || 0,
      target_date: targetDate || null,
    });
    onOpenChange(false);
    // Reset form
    setName('');
    setTargetAmount('');
    setCurrentAmount('0');
    setIcon('🎯');
    setColor('#22c55e');
    setTargetDate('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editGoal ? t('savingsGoals.editGoal') : t('savingsGoals.addGoal')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>{t('savingsGoals.name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('savingsGoals.namePlaceholder')} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('savingsGoals.targetAmount')} ({currency.symbol})</Label>
              <Input type="number" step="0.01" min="0" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} required />
            </div>
            <div>
              <Label>{t('savingsGoals.currentAmount')} ({currency.symbol})</Label>
              <Input type="number" step="0.01" min="0" value={currentAmount} onChange={e => setCurrentAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>{t('savingsGoals.targetDate')}</Label>
            <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
          </div>

          <div>
            <Label>{t('savingsGoals.icon')}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONS.map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                    icon === i ? 'ring-2 ring-primary bg-primary/10 scale-110' : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full">
            {editGoal ? t('common.save') : t('savingsGoals.addGoal')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
