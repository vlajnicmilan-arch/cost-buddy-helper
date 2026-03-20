import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useSavingsGoals, SavingsGoal } from '@/hooks/useSavingsGoals';
import { SavingsGoalDialog } from './SavingsGoalDialog';
import { SavingsAddAmountDialog } from './SavingsAddAmountDialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Plus, Target, Trash2, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';

export const SavingsGoalsSection = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { hasAccess, getRequiredTier } = useFeatureAccess();
  const { goals, loading, addGoal, updateGoal, deleteGoal, addAmount } = useSavingsGoals();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addAmountGoal, setAddAmountGoal] = useState<SavingsGoal | null>(null);
  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null);

  if (!hasAccess('savings_goals')) {
    return <UpgradePrompt feature={t('savings.title', 'Ciljevi štednje')} requiredTier={getRequiredTier('savings_goals')} compact />;
  }

  if (loading) return null;

  const handleSave = (goal: Omit<SavingsGoal, 'id' | 'created_at' | 'user_id' | 'is_completed' | 'completed_at'>) => {
    if (editGoal) {
      updateGoal(editGoal.id, goal);
    } else {
      addGoal(goal);
    }
    setEditGoal(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-6"
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          <h3 className="text-base sm:text-lg font-semibold">{t('savingsGoals.title')}</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setEditGoal(null); setDialogOpen(true); }} className="h-8 px-2">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-6">
          <PiggyBank className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('savingsGoals.noGoals')}</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} className="mt-3">
            <Plus className="w-3 h-3 mr-1" />
            {t('savingsGoals.addGoal')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const progress = goal.target_amount > 0
              ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
              : 0;
            const remaining = Math.max(goal.target_amount - goal.current_amount, 0);
            const daysLeft = goal.target_date
              ? differenceInDays(new Date(goal.target_date), new Date())
              : null;

            return (
              <div
                key={goal.id}
                className={cn(
                  "p-3 rounded-lg border transition-all",
                  goal.is_completed ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-card/50'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{goal.icon}</span>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-medium truncate", goal.is_completed && "line-through text-muted-foreground")}>
                        {goal.name}
                      </p>
                      {daysLeft !== null && !goal.is_completed && (
                        <p className={cn("text-[10px]", daysLeft < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {daysLeft < 0
                            ? t('savingsGoals.overdue')
                            : t('savingsGoals.daysLeft', { count: daysLeft })}
                        </p>
                      )}
                      {goal.is_completed && (
                        <p className="text-[10px] text-primary">✓ {t('savingsGoals.completed')}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!goal.is_completed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setAddAmountGoal(goal)}
                      >
                        <Plus className="w-3 h-3 mr-0.5" />
                        {t('savingsGoals.add')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteGoal(goal.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <Progress value={progress} className="h-2 mb-1.5" />

                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{formatAmount(goal.current_amount)}</span>
                  <span>{formatAmount(goal.target_amount)}</span>
                </div>
                {!goal.is_completed && remaining > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t('savingsGoals.remaining')}: {formatAmount(remaining)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SavingsGoalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        editGoal={editGoal}
      />

      {addAmountGoal && (
        <SavingsAddAmountDialog
          open={!!addAmountGoal}
          onOpenChange={(open) => { if (!open) setAddAmountGoal(null); }}
          goalName={addAmountGoal.name}
          onAdd={(amount) => {
            addAmount(addAmountGoal.id, amount);
            setAddAmountGoal(null);
          }}
        />
      )}
    </motion.div>
  );
};
