import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  MoreHorizontal,
  Calendar,
  Edit,
  Trash2,
  RotateCcw
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BudgetWithStats, BUDGET_PERIOD_LABELS } from '@/types/budget';

interface BudgetCardProps {
  budget: BudgetWithStats;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReset?: () => void;
}

export const BudgetCard = ({ 
  budget, 
  onClick, 
  onEdit, 
  onDelete,
  onReset 
}: BudgetCardProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();

  const TrendIcon = budget.trend === 'up' 
    ? TrendingUp 
    : budget.trend === 'down' 
      ? TrendingDown 
      : Minus;

  const getProgressColor = () => {
    if (budget.isOverBudget) return 'bg-destructive';
    if (budget.isWarning) return 'bg-warning';
    return 'bg-primary';
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "glass-card rounded-xl sm:rounded-2xl p-5 sm:p-6 transition-all duration-200 cursor-pointer hover:scale-[1.01] hover:shadow-lg",
          budget.isOverBudget && "ring-2 ring-destructive/50",
          budget.isWarning && !budget.isOverBudget && "ring-2 ring-warning/50"
        )}
        onClick={onClick}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Icon and Info */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div 
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center text-2xl sm:text-3xl shrink-0"
              style={{ backgroundColor: `${budget.color}20` }}
            >
              {budget.icon || '💰'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-lg sm:text-xl truncate">{budget.name}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <span className="capitalize">{BUDGET_PERIOD_LABELS[budget.period_type]}</span>
                {budget.daysRemaining !== undefined && budget.daysRemaining >= 0 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {budget.daysRemaining} {t('common.daysLeft', 'dana')}
                    </span>
                  </>
                )}
              </div>
              
              {/* Progress bar */}
              <div className="mt-3">
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={cn("h-full rounded-full", getProgressColor())}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(budget.percentage, 100)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Amount and Actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="text-right">
              <p className={cn(
                "text-lg sm:text-xl font-mono font-bold",
                budget.isOverBudget ? "text-destructive" : "text-foreground"
              )}>
                {formatAmount(budget.remaining)}
              </p>
              <p className="text-xs text-muted-foreground">
                / {formatAmount(budget.total_amount)} ({budget.percentage.toFixed(0)}%)
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Warning/Status indicators */}
              {(budget.isOverBudget || budget.isWarning) && (
                <div className={cn(
                  "p-1 rounded-md",
                  budget.isOverBudget ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                )}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Trend indicator */}
              {budget.trend && (
                <div className={cn(
                  "p-1 rounded-md",
                  budget.trend === 'up' && "bg-expense/10 text-expense",
                  budget.trend === 'down' && "bg-income/10 text-income",
                  budget.trend === 'stable' && "bg-muted text-muted-foreground"
                )}>
                  <TrendIcon className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Actions Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
                    <Edit className="w-4 h-4 mr-2" />
                    {t('common.edit', 'Uredi')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onReset?.(); }}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {t('budget.reset', 'Resetiraj')}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('common.delete', 'Obriši')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('budget.deleteConfirmTitle', 'Obriši budžet?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('budget.deleteConfirmDesc', 'Ova radnja će trajno obrisati budžet "{{name}}" i sve njegove limite po kategorijama. Ovo se ne može poništiti.').replace('{{name}}', budget.name)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => { onDelete?.(); setDeleteDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', 'Obriši')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
