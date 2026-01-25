import { useState } from 'react';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { SavingsGoal, DEFAULT_BUDGET_COLORS } from '@/types/budget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Plus, Edit, Trash2, Loader2, Target, Check, PlusCircle } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

interface SavingsGoalsTabProps {
  budgetId: string;
  isOwner: boolean;
}

export const SavingsGoalsTab = ({ budgetId, isOwner }: SavingsGoalsTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { goals, loading, addGoal, updateGoal, addToGoal, deleteGoal } = useSavingsGoals(budgetId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [addAmountDialogOpen, setAddAmountDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('#22c55e');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [addAmount, setAddAmount] = useState('');

  const handleAdd = () => {
    setEditingGoal(null);
    setName('');
    setDescription('');
    setIcon('🎯');
    setColor('#22c55e');
    setTargetAmount('');
    setTargetDate('');
    setDialogOpen(true);
  };

  const handleEdit = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setName(goal.name);
    setDescription(goal.description || '');
    setIcon(goal.icon || '🎯');
    setColor(goal.color || '#22c55e');
    setTargetAmount(goal.target_amount.toString());
    setTargetDate(goal.target_date || '');
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name || !targetAmount) return;

    if (editingGoal) {
      await updateGoal({
        ...editingGoal,
        name,
        description: description || null,
        icon,
        color,
        target_amount: parseFloat(targetAmount),
        target_date: targetDate || null
      });
    } else {
      await addGoal({
        budget_id: budgetId,
        name,
        description: description || null,
        icon,
        color,
        target_amount: parseFloat(targetAmount),
        current_amount: 0,
        target_date: targetDate || null,
        is_completed: false
      });
    }

    setDialogOpen(false);
  };

  const handleAddAmount = async () => {
    if (!selectedGoalId || !addAmount) return;
    await addToGoal(selectedGoalId, parseFloat(addAmount));
    setAddAmountDialogOpen(false);
    setAddAmount('');
    setSelectedGoalId(null);
  };

  const openAddAmountDialog = (goalId: string) => {
    setSelectedGoalId(goalId);
    setAddAmount('');
    setAddAmountDialogOpen(true);
  };

  const goalIcons = ['🎯', '🏠', '🚗', '✈️', '💻', '📱', '🎓', '💍', '🏖️', '🎁'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('budget.savingsGoals', 'Ciljevi štednje')}</h3>
        {isOwner && (
          <Button onClick={handleAdd} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('common.add', 'Dodaj')}
          </Button>
        )}
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('budget.noGoals', 'Nema ciljeva štednje')}</p>
          <p className="text-sm">{t('budget.noGoalsHint', 'Dodaj cilj za praćenje napretka')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {goals.map((goal) => {
            const percentage = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
            const remaining = goal.target_amount - goal.current_amount;

            return (
              <Card 
                key={goal.id}
                className={goal.is_completed ? 'border-green-500/50 bg-green-500/5' : ''}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                        style={{ backgroundColor: `${goal.color}20` }}
                      >
                        {goal.is_completed ? <Check className="w-5 h-5 text-green-500" /> : goal.icon}
                      </div>
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          {goal.name}
                          {goal.is_completed && (
                            <span className="text-xs text-green-500 font-normal">
                              {t('budget.completed', 'Postignuto!')}
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatAmount(goal.current_amount)} / {formatAmount(goal.target_amount)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {isOwner && !goal.is_completed && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openAddAmountDialog(goal.id)}
                          title={t('budget.addMoney', 'Dodaj novac')}
                        >
                          <PlusCircle className="w-4 h-4 text-green-500" />
                        </Button>
                      )}
                      {isOwner && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(goal)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteGoal(goal.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {goal.description && (
                    <p className="text-sm text-muted-foreground mb-3">{goal.description}</p>
                  )}

                  <Progress value={Math.min(percentage, 100)} className="mb-2" />

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{percentage.toFixed(1)}%</span>
                    {goal.target_date && (
                      <span>
                        {t('budget.targetDate', 'Cilj')}: {format(new Date(goal.target_date), 'd. MMM yyyy', { locale: hr })}
                      </span>
                    )}
                    {!goal.is_completed && remaining > 0 && (
                      <span>{t('budget.remaining', 'Preostalo')}: {formatAmount(remaining)}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Goal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingGoal ? t('budget.editGoal', 'Uredi cilj') : t('budget.addGoal', 'Novi cilj')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.name', 'Naziv')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('budget.goalNamePlaceholder', 'npr. Novi laptop')}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('common.description', 'Opis')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('budget.goalDescPlaceholder', 'Opišite cilj...')}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.icon', 'Ikona')}</Label>
                <div className="flex flex-wrap gap-1">
                  {goalIcons.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIcon(i)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all ${
                        icon === i ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('common.color', 'Boja')}</Label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_BUDGET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        color === c ? 'border-foreground scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('budget.targetAmount', 'Ciljani iznos')}</Label>
              <Input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('budget.targetDate', 'Ciljani datum')}</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button onClick={handleSubmit}>
              {editingGoal ? t('common.save', 'Spremi') : t('common.add', 'Dodaj')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Amount Dialog */}
      <Dialog open={addAmountDialogOpen} onOpenChange={setAddAmountDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('budget.addToGoal', 'Dodaj iznos')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.amount', 'Iznos')}</Label>
              <Input
                type="number"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAmountDialogOpen(false)}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button onClick={handleAddAmount}>
              {t('common.add', 'Dodaj')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
