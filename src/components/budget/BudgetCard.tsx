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
  Trash2,
  Repeat
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

  const budgetColor = budget.color || '#3b82f6';

  const TrendIcon = budget.trend === 'up' 
    ? TrendingUp 
    : budget.trend === 'down' 
      ? TrendingDown 
      : Minus;

  // Smjer v1: neutralna vizualizacija — bez crvene/žute alarm palete.
  // Progress bar uvijek u boji plana; status badge samo iznosi postotak
  // ili "Preko okvira" (neutralno), bez destructive tona.
  const getProgressColor = () => 'bg-module';

  const budgetStatus = budget.isOverBudget ? 'overBudget' : 'active';
  const getBorderColor = () => budgetColor;

  const getCategoryDisplay = (categoryId: string) => {
    const catInfo = CATEGORIES.find(c => c.id === categoryId);
    return catInfo ? { name: catInfo.name, icon: catInfo.icon } : { name: categoryId, icon: '📂' };
  };

  const allOriginalCategories = budget.categories
    .filter(c => c.originalCategories && c.originalCategories.length > 0)
    .flatMap(c => c.originalCategories || []);
  
  const uniqueOriginalCategories = [...new Set(allOriginalCategories)];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ 
          scale: 1.01,
          boxShadow: `0 4px 20px ${budgetColor}18`
        }}
        className="relative group p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer transition-all duration-300 overflow-hidden"
        style={{ 
          borderLeftColor: getBorderColor(),
          borderLeftWidth: 3,
          background: `linear-gradient(135deg, ${budgetColor}0A 0%, ${budgetColor}04 50%, transparent 100%)`,
          boxShadow: `0 2px 12px ${budgetColor}08`,
        }}
        onClick={onClick}
        data-highlight-id={`budget:${budget.id}`}
      >
        {/* Subtle radial glow */}
        <div
          className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-300 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${budgetColor} 0%, transparent 70%)` }}
        />

        {/* Hover Actions removed from top-right — moved to footer row below to be visible on mobile and avoid overlap with status badges/icons */}

        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 shadow-sm"
              style={{ background: `linear-gradient(135deg, ${budgetColor}25, ${budgetColor}15)` }}
            >
              {budget.icon || '💰'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-semibold text-base sm:text-lg truncate text-[hsl(258_90%_66%)]">{budget.name}</h3>
                <Badge variant={getStatusBadgeVariant(budgetStatus)} className="text-xs shrink-0">
                  {t(`budget.status.${budgetStatus}`)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{t(`budget.period.${budget.period_type}`)}</span>
                {!budget.is_recurring && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1">
                    {t('budget.oneTime', 'Jednokratno')}
                  </Badge>
                )}
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

          {budget.isWarning && !budget.isOverBudget && (
            <p className="text-xs text-budget-warning font-medium mt-1">
              {t('budget.nearLimit', { percent: budget.percentage.toFixed(0) })}
            </p>
          )}

          {/* Show original categories */}
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

          {/* Action footer — always visible (mobile-first), separated from content */}
          <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/60"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
              {t('common.edit', 'Uredi')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('common.delete', 'Obriši')}
            </Button>
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