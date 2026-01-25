import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Button } from '@/components/ui/button';
import { BudgetCard } from './BudgetCard';
import { BudgetDetailDialog } from './BudgetDetailDialog';
import { BudgetDialog } from './BudgetDialog';
import { BudgetWithStats } from '@/types/budget';
import { Plus, Target, Loader2 } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface BudgetSectionProps {
  budgets: BudgetWithStats[];
  loading: boolean;
  onCreateBudget: (budget: Partial<BudgetWithStats>) => Promise<void>;
  onUpdateBudget: (budget: BudgetWithStats) => Promise<void>;
  onDeleteBudget: (id: string) => Promise<void>;
  onResetBudget: (id: string) => Promise<void>;
  trendData?: { date: string; spent: number; limit: number }[];
}

export const BudgetSection = ({
  budgets,
  loading,
  onCreateBudget,
  onUpdateBudget,
  onDeleteBudget,
  onResetBudget,
  trendData = [],
}: BudgetSectionProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const [selectedBudget, setSelectedBudget] = useState<BudgetWithStats | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithStats | null>(null);

  const handleCardClick = (budget: BudgetWithStats) => {
    setSelectedBudget(budget);
    setDetailDialogOpen(true);
  };

  const handleEdit = (budget: BudgetWithStats) => {
    setEditingBudget(budget);
    setCreateDialogOpen(true);
  };

  const handleDialogClose = () => {
    setCreateDialogOpen(false);
    setEditingBudget(null);
  };

  // Summary stats
  const totalBudget = budgets.reduce((sum, b) => sum + b.total_amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const overBudgetCount = budgets.filter(b => b.isOverBudget).length;
  const warningCount = budgets.filter(b => b.isWarning && !b.isOverBudget).length;

  const formatAxisCurrency = (amount: number) =>
    new Intl.NumberFormat(currency.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">{t('budget.title', 'Budžeti')}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {budgets.length} {t('budget.activeBudgets', 'aktivnih budžeta')}
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('budget.create', 'Novi budžet')}</span>
        </Button>
      </div>

      {/* Summary Stats */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">{t('budget.totalBudget', 'Ukupni budžet')}</p>
            <p className="text-base sm:text-lg font-mono font-bold">{formatAmount(totalBudget)}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">{t('budget.totalSpent', 'Ukupno potrošeno')}</p>
            <p className="text-base sm:text-lg font-mono font-bold">{formatAmount(totalSpent)}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">{t('budget.remaining', 'Preostalo')}</p>
            <p className="text-base sm:text-lg font-mono font-bold text-income">{formatAmount(totalBudget - totalSpent)}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">{t('budget.alerts', 'Upozorenja')}</p>
            <div className="flex items-center gap-2">
              {overBudgetCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                  {overBudgetCount} {t('budget.over', 'preko')}
                </span>
              )}
              {warningCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs font-medium">
                  {warningCount} {t('budget.warning', 'upoz.')}
                </span>
              )}
              {overBudgetCount === 0 && warningCount === 0 && (
                <span className="text-sm text-income">✓ {t('budget.allGood', 'Sve OK')}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      {trendData.length > 0 && (
        <div className="glass-card rounded-xl sm:rounded-2xl p-4">
          <h3 className="text-sm font-medium mb-3">{t('budget.spendingTrend', 'Trend potrošnje')}</h3>
          <div className="h-32 sm:h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ left: -10, right: 5 }}>
                <defs>
                  <linearGradient id="spentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickFormatter={formatAxisCurrency} width={45} />
                <Tooltip 
                  formatter={(value: number) => formatAmount(value)}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="spent" 
                  stroke="hsl(var(--primary))" 
                  fill="url(#spentGradient)"
                  strokeWidth={2}
                  name={t('budget.spent', 'Potrošeno')}
                />
                <Area 
                  type="monotone" 
                  dataKey="limit" 
                  stroke="hsl(var(--muted-foreground))" 
                  fill="none"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  name={t('budget.limit', 'Limit')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Budget Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-8 px-4">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
            <Target className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium mb-1">{t('budget.noBudgets', 'Nema budžeta')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('budget.noBudgetsHint', 'Koristi gumb iznad za kreiranje prvog budžeta')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onClick={() => handleCardClick(budget)}
              onEdit={() => handleEdit(budget)}
              onDelete={() => onDeleteBudget(budget.id)}
              onReset={() => onResetBudget(budget.id)}
            />
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <BudgetDetailDialog
        budget={selectedBudget}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={() => {
          if (selectedBudget) {
            setDetailDialogOpen(false);
            handleEdit(selectedBudget);
          }
        }}
      />

      {/* Create/Edit Dialog */}
      <BudgetDialog
        budget={editingBudget}
        open={createDialogOpen}
        onOpenChange={handleDialogClose}
        onSave={async (budget) => {
          if (editingBudget) {
            await onUpdateBudget(budget as BudgetWithStats);
          } else {
            await onCreateBudget(budget);
          }
          handleDialogClose();
        }}
      />
    </motion.section>
  );
};
