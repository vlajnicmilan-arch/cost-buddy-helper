import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Calendar,
  Pencil,
  Trash2
} from 'lucide-react';
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
import { BudgetWithStats } from '@/types/budget';
import { CATEGORIES } from '@/types/expense';


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

  // Get budget status
  const getBudgetStatus = () => {
    if (budget.isOverBudget) return 'overBudget';
    if (budget.isWarning) return 'warning';
    return 'active';
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'warning': return 'outline';
      case 'overBudget': return 'destructive';
      default: return 'outline';
    }
  };

  const budgetStatus = getBudgetStatus();

  // Determine border color based on status
  const getBorderColor = () => {
    if (budget.isOverBudget) return 'hsl(var(--destructive))';
    if (budget.isWarning) return 'hsl(var(--warning))';
    return budget.color || 'hsl(var(--primary))';
  };

  // Helper to get category display info
  const getCategoryDisplay = (categoryId: string) => {
    const catInfo = CATEGORIES.find(c => c.id === categoryId);
    return catInfo ? { name: catInfo.name, icon: catInfo.icon } : { name: categoryId, icon: '📂' };
  };

  // Collect all original categories from all budget categories that have them
  const allOriginalCategories = budget.categories
    .filter(c => c.originalCategories && c.originalCategories.length > 0)
    .flatMap(c => c.originalCategories || []);
  
  // Remove duplicates
  const uniqueOriginalCategories = [...new Set(allOriginalCategories)];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ 
          scale: 1.01,
          boxShadow: `0 8px 25px -5px ${budget.color}30`
        }}
        className="relative group p-4 rounded-xl border bg-card cursor-pointer transition-colors"
        style={{ 
          borderLeftColor: getBorderColor(),
          borderLeftWidth: 4
        }}
        onClick={onClick}
      >
        {/* Hover Actions */}
        <div className={cn(
          "flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
          "absolute top-2 right-2"
        )}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        {/* Header row - Icon, Name, Actions */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
              style={{ backgroundColor: `${budget.color}20` }}
            >
              {budget.icon || '💰'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-semibold text-base sm:text-lg truncate">{budget.name}</h3>
                <Badge variant={getStatusBadgeVariant(budgetStatus)} className="text-xs shrink-0">
                  {t(`budget.status.${budgetStatus}`)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{t(`budget.period.${budget.period_type}`)}</span>
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
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-1.5 shrink-0">
            {(budget.isOverBudget || budget.isWarning) && (
              <div className={cn(
                "p-1.5 rounded-md",
                budget.isOverBudget ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
              )}>
                <AlertTriangle className="w-4 h-4" />
              </div>
            )}

            {budget.trend && budget.trend !== 'stable' && (
              <div className={cn(
                "p-1.5 rounded-md",
                budget.trend === 'up' && "bg-expense/10 text-expense",
                budget.trend === 'down' && "bg-income/10 text-income"
              )}>
                <TrendIcon className="w-4 h-4" />
              </div>
            )}
          </div>
        </div>

        {/* Progress section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('budget.spent', 'Potrošeno')}</span>
            <span className={cn(
              "font-mono font-semibold",
              budget.isOverBudget ? "text-destructive" : "text-foreground"
            )}>
              {formatAmount(budget.total_amount - budget.remaining)} / {formatAmount(budget.total_amount)}
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

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{budget.percentage.toFixed(0)}% {t('budget.used', 'iskorišteno')}</span>
            <span className={cn(
              "font-medium",
              budget.isOverBudget ? "text-destructive" : "text-primary"
            )}>
              {formatAmount(budget.remaining)} {t('budget.remaining', 'preostalo')}
            </span>
          </div>

          {/* Show original categories from all budget categories */}
          {uniqueOriginalCategories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground mr-1">📌</span>
              {uniqueOriginalCategories.map(origCat => {
                const catDisplay = getCategoryDisplay(origCat);
                return (
                  <Badge key={origCat} variant="secondary" className="text-xs py-0 px-1.5">
                    <span className="mr-0.5">{catDisplay.icon}</span>
                    {catDisplay.name}
                  </Badge>
                );
              })}
            </div>
          )}
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
