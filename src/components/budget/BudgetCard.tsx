import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  RotateCcw,
  ChevronDown
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  const [isOpen, setIsOpen] = useState(false);
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
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "glass-card rounded-xl sm:rounded-2xl transition-all duration-200",
          budget.isOverBudget && "ring-2 ring-destructive/50",
          budget.isWarning && !budget.isOverBudget && "ring-2 ring-warning/50"
        )}
      >
        {/* Collapsed Header - Always Visible */}
        <CollapsibleTrigger asChild>
          <div className="p-4 sm:p-5 cursor-pointer hover:bg-muted/30 transition-colors rounded-xl sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div 
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-2xl sm:text-3xl shrink-0"
                  style={{ backgroundColor: `${budget.color}20` }}
                >
                  {budget.icon || '💰'}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-base sm:text-lg truncate">{budget.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="capitalize">{BUDGET_PERIOD_LABELS[budget.period_type]}</span>
                    {budget.daysRemaining !== undefined && budget.daysRemaining >= 0 && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {budget.daysRemaining} {t('common.daysLeft', 'dana')}
                        </span>
                      </>
                    )}
                  </div>
                  
                  {/* Progress bar in collapsed state */}
                  <div className="mt-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
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

              <div className="flex flex-col items-end gap-1 shrink-0">
                {/* Amount and percentage */}
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

                <div className="flex items-center gap-1.5 mt-1">
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

                  {/* Expand indicator */}
                  <ChevronDown className={cn(
                    "w-5 h-5 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180"
                  )} />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Expanded Content */}
        <CollapsibleContent>
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-border/30"
              >
                {/* Actions Row */}
                <div className="flex items-center justify-between pt-3 mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClick}
                    className="text-xs"
                  >
                    {t('budget.viewDetails', 'Otvori detalje')}
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit?.()}>
                        <Edit className="w-4 h-4 mr-2" />
                        {t('common.edit', 'Uredi')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onReset?.()}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        {t('budget.reset', 'Resetiraj')}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('common.delete', 'Obriši')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">
                      {t('budget.spent', 'Potrošeno')}: {formatAmount(budget.spent)}
                    </span>
                    <span className="text-xs font-medium">
                      {budget.percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={cn("h-full rounded-full", getProgressColor())}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(budget.percentage, 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className={cn(
                      "text-lg sm:text-xl font-mono font-bold",
                      budget.isOverBudget ? "text-destructive" : "text-foreground"
                    )}>
                      {formatAmount(budget.remaining)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {t('budget.remaining', 'Preostalo')} / {formatAmount(budget.total_amount)}
                    </p>
                  </div>

                  {/* Trend indicator */}
                  {budget.trend && (
                    <div className={cn(
                      "p-1.5 rounded-lg",
                      budget.trend === 'up' && "bg-expense/10 text-expense",
                      budget.trend === 'down' && "bg-income/10 text-income",
                      budget.trend === 'stable' && "bg-muted text-muted-foreground"
                    )}>
                      <TrendIcon className="w-4 h-4" />
                    </div>
                  )}
                </div>

                {/* Category mini-bars (top 3) */}
                {budget.categories.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                    {budget.categories.slice(0, 3).map((cat) => (
                      <div key={cat.id} className="flex items-center gap-2">
                        <span className="text-xs w-16 truncate">{cat.icon || '📂'} {cat.category}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full",
                              cat.isOverBudget ? "bg-destructive" : cat.isWarning ? "bg-warning" : "bg-primary/70"
                            )}
                            style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                          {cat.percentage.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CollapsibleContent>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
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
      </motion.div>
    </Collapsible>
  );
};
