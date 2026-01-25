import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { BudgetWithStats, BUDGET_PERIOD_LABELS } from '@/types/budget';
import { useBudgetMembers } from '@/hooks/useBudgetMembers';
import { BudgetMembersTab } from './BudgetMembersTab';
import { cn } from '@/lib/utils';
import { 
  X,
  Edit,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Users,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BudgetFullScreenViewProps {
  open: boolean;
  onClose: () => void;
  budget: BudgetWithStats | null;
  onEdit: () => void;
}

export const BudgetFullScreenView = ({
  open,
  onClose,
  budget,
  onEdit,
}: BudgetFullScreenViewProps) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');
  const { members, invitations, loading: membersLoading, isOwner, refetch: refetchMembers } = useBudgetMembers(budget?.id || null);

  // Reset tab when budget changes
  useEffect(() => {
    if (!open) {
      setActiveTab('overview');
    }
  }, [open, budget?.id]);

  // Handle back navigation
  useEffect(() => {
    if (!open) return;

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      onClose();
    };

    window.history.pushState({ budgetView: true }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [open, onClose]);

  if (!budget) return null;

  const TrendIcon = budget.trend === 'up' 
    ? TrendingUp 
    : budget.trend === 'down' 
      ? TrendingDown 
      : Minus;

  const getProgressColor = (percentage: number, isOver: boolean, isWarning: boolean) => {
    if (isOver) return 'bg-destructive';
    if (isWarning) return 'bg-warning';
    return 'bg-primary';
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background"
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
                  <X className="w-5 h-5" />
                </Button>
                <div 
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl shrink-0"
                  style={{ backgroundColor: `${budget.color}20` }}
                >
                  {budget.icon || '💰'}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold truncate">{budget.name}</h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit className="w-4 h-4 mr-1" />
                {t('common.edit', 'Uredi')}
              </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto p-4 sm:p-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="overview" className="gap-2">
                      <BarChart3 className="w-4 h-4" />
                      {t('budget.overview', 'Pregled')}
                    </TabsTrigger>
                    <TabsTrigger value="members" className="gap-2">
                      <Users className="w-4 h-4" />
                      {t('budget.members', 'Članovi')} ({members.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-6">
                    {/* Main Progress Card */}
                    <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-muted-foreground">{t('budget.overallProgress', 'Ukupni napredak')}</span>
                        <div className="flex items-center gap-2">
                          {(budget.isOverBudget || budget.isWarning) && (
                            <AlertTriangle className={cn(
                              "w-5 h-5",
                              budget.isOverBudget ? "text-destructive" : "text-warning"
                            )} />
                          )}
                          <span className={cn(
                            "text-lg font-bold",
                            budget.isOverBudget && "text-destructive",
                            budget.isWarning && !budget.isOverBudget && "text-warning"
                          )}>
                            {budget.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-4 bg-muted rounded-full overflow-hidden mb-4">
                        <motion.div 
                          className={cn("h-full rounded-full", getProgressColor(budget.percentage, budget.isOverBudget, budget.isWarning))}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(budget.percentage, 100)}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-bold text-2xl sm:text-3xl">{formatAmount(budget.spent)}</p>
                          <p className="text-sm text-muted-foreground">{t('budget.spent', 'Potrošeno')}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            "font-mono font-bold text-2xl sm:text-3xl",
                            budget.remaining < 0 ? "text-destructive" : "text-income"
                          )}>
                            {formatAmount(budget.remaining)}
                          </p>
                          <p className="text-sm text-muted-foreground">{t('budget.remaining', 'Preostalo')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-card border border-border">
                        <p className="text-xs text-muted-foreground mb-1">{t('budget.totalBudget', 'Ukupni budžet')}</p>
                        <p className="font-mono font-bold text-lg">{formatAmount(budget.total_amount)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-card border border-border">
                        <p className="text-xs text-muted-foreground mb-1">{t('budget.dailyAverage', 'Prosj. dnevno')}</p>
                        <p className="font-mono font-bold text-lg">{formatAmount(budget.dailyAverage || 0)}</p>
                      </div>
                      {budget.trend && (
                        <div className="p-4 rounded-xl bg-card border border-border">
                          <p className="text-xs text-muted-foreground mb-1">{t('budget.trend', 'Trend')}</p>
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "p-1.5 rounded-lg",
                              budget.trend === 'up' && "bg-expense/10 text-expense",
                              budget.trend === 'down' && "bg-income/10 text-income",
                              budget.trend === 'stable' && "bg-muted text-muted-foreground"
                            )}>
                              <TrendIcon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">
                              {budget.trend === 'up' && t('budget.trendUp', 'Raste')}
                              {budget.trend === 'down' && t('budget.trendDown', 'Pada')}
                              {budget.trend === 'stable' && t('budget.trendStable', 'Stabilno')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Categories Breakdown */}
                    {budget.categories.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">{t('budget.byCategories', 'Po kategorijama')}</h3>
                        <div className="space-y-3">
                          {budget.categories.map((cat) => (
                            <div key={cat.id} className="p-4 rounded-xl bg-card border border-border">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">{cat.icon || '📂'}</span>
                                  <span className="font-medium">{cat.category}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(cat.isOverBudget || cat.isWarning) && (
                                    <AlertTriangle className={cn(
                                      "w-4 h-4",
                                      cat.isOverBudget ? "text-destructive" : "text-warning"
                                    )} />
                                  )}
                                  <span className="font-medium">{cat.percentage.toFixed(0)}%</span>
                                </div>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                                <div 
                                  className={cn("h-full rounded-full", getProgressColor(cat.percentage, cat.isOverBudget, cat.isWarning))}
                                  style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>{formatAmount(cat.spent)} / {formatAmount(cat.limit_amount)}</span>
                                <span className={cat.remaining < 0 ? "text-destructive" : ""}>
                                  {cat.remaining < 0 ? '-' : ''}{formatAmount(Math.abs(cat.remaining))} {t('budget.left', 'preostalo')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="members">
                    <BudgetMembersTab
                      budgetId={budget.id}
                      members={members}
                      invitations={invitations}
                      isOwner={isOwner}
                      loading={membersLoading}
                      onRefetch={refetchMembers}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
