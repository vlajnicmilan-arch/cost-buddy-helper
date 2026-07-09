import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { BudgetWithStats, BUDGET_PERIOD_LABELS } from '@/types/budget';
import { useBudgetMembers } from '@/hooks/useBudgetMembers';
import { BudgetMembersTab } from './BudgetMembersTab';
import { getCategoryInfo, CATEGORIES } from '@/types/expense';
import { computeFrameAllocation } from '@/lib/budgetPaceSignal';
import { cn } from '@/lib/utils';
import { 
  Edit,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Users
} from 'lucide-react';

interface BudgetDetailDialogProps {
  budget: BudgetWithStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}

export const BudgetDetailDialog = ({
  budget,
  open,
  onOpenChange,
  onEdit,
}: BudgetDetailDialogProps) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const { members, invitations, loading: membersLoading, isOwner, refetch: refetchMembers } = useBudgetMembers(budget?.id || null);

  if (!budget) return null;

  const TrendIcon = budget.trend === 'up' 
    ? TrendingUp 
    : budget.trend === 'down' 
      ? TrendingDown 
      : Minus;

  const getProgressColor = () => 'bg-primary';
  const alloc = computeFrameAllocation(
    Number(budget.total_amount) || 0,
    budget.categories.map(c => Number(c.limit_amount) || 0),
  );
  const totalPlanned = alloc.totalAllocated;
  const totalSpent = budget.spent;
  const totalDeviation = totalSpent - totalPlanned;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: `${budget.color}20` }}
            >
              {budget.icon || '💰'}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">{budget.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {t(`budget.period.${budget.period_type}`, BUDGET_PERIOD_LABELS[budget.period_type])}
                {budget.daysRemaining !== undefined && budget.daysRemaining >= 0 && (
                  <> • {budget.daysRemaining} {t('common.daysLeft', 'dana preostalo')}</>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-1" />
              {t('common.edit', 'Uredi')}
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              {t('budget.overview')}
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="w-4 h-4" />
              {t('budget.members')} ({members.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Main Progress */}
            <div className="p-4 rounded-xl bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{t('budget.overallProgress')}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {budget.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden mb-3">
                <div 
                  className={cn("h-full rounded-full transition-all", getProgressColor())}
                  style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                />
              </div>

              {/* Neusmjereno / Preko okvira — neutralno */}
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                {alloc.isOverFrame ? (
                  <>
                    <span>{t('budget.overFrame', 'Preko okvira')}</span>
                    <span className="font-mono">{formatAmount(alloc.overFrame)}</span>
                  </>
                ) : (
                  <>
                    <span>{t('budget.unallocated', 'Neusmjereno')}</span>
                    <span className="font-mono">{formatAmount(alloc.unallocated)}</span>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-mono font-bold text-lg">{formatAmount(budget.spent)}</p>
                  <p className="text-xs text-muted-foreground">{t('budget.spent')}</p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-mono font-bold text-lg",
                    budget.remaining < 0 ? "text-destructive" : "text-income"
                  )}>
                    {formatAmount(budget.remaining)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('budget.remaining')}</p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">{t('budget.totalBudget')}</p>
                <p className="font-mono font-bold">{formatAmount(budget.total_amount)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">{t('budget.dailyAverage')}</p>
                <p className="font-mono font-bold">{formatAmount(budget.dailyAverage || 0)}</p>
              </div>
            </div>

            {/* Trend */}
            {budget.trend && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <div className={cn(
                  "p-2 rounded-lg",
                  budget.trend === 'up' && "bg-expense/10 text-expense",
                  budget.trend === 'down' && "bg-income/10 text-income",
                  budget.trend === 'stable' && "bg-muted text-muted-foreground"
                )}>
                  <TrendIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {budget.trend === 'up' && t('budget.trendUp')}
                    {budget.trend === 'down' && t('budget.trendDown')}
                    {budget.trend === 'stable' && t('budget.trendStable')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('budget.comparedToLastPeriod')}
                  </p>
                </div>
              </div>
            )}

            {/* Categories Breakdown */}
            {budget.categories.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-module-muted">{t('budget.byCategories')}</h4>
                <div className="space-y-2">
                  {budget.categories.map((cat) => {
                    // Get category info for displaying original categories
                    const getCategoryDisplay = (categoryId: string) => {
                      const catInfo = CATEGORIES.find(c => c.id === categoryId);
                      return catInfo ? { name: catInfo.name, icon: catInfo.icon } : { name: categoryId, icon: '📂' };
                    };
                    
                    return (
                    <div key={cat.id} className="p-3 rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{cat.icon || '📂'}</span>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{cat.category === '__budget_manual_assigned__' ? t('budget.manualAssigned') : cat.category}</span>
                            {/* Show original categories for manually assigned expenses */}
                            {cat.originalCategories && cat.originalCategories.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {cat.originalCategories.map(origCat => {
                                  const catDisplay = getCategoryDisplay(origCat);
                                  return (
                                    <Badge key={origCat} variant="secondary" className="text-xs py-0 px-1.5">
                                      <span className="mr-1">{catDisplay.icon}</span>
                                      {catDisplay.name}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{cat.percentage.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                        <div 
                          className={cn("h-full rounded-full bg-primary")}
                          style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                        />
                      </div>
                      {/* Planirano / Stvarno / Odstupanje — neutralno */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">{t('budget.planned', 'Planirano')}</p>
                          <p className="font-mono">{formatAmount(cat.limit_amount)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('budget.actualLabel', 'Stvarno')}</p>
                          <p className="font-mono">{formatAmount(cat.spent)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">{t('budget.deviation', 'Odstupanje')}</p>
                          <p className="font-mono">
                            {(() => {
                              const dev = cat.spent - cat.limit_amount;
                              const sign = dev > 0 ? '+' : dev < 0 ? '−' : '±';
                              return `${sign}${formatAmount(Math.abs(dev))}`;
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                  })}

                  {/* Ukupni red */}
                  <div className="p-3 rounded-lg border border-border/50 bg-muted/40">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">{t('budget.totalRow', 'Ukupno')} · {t('budget.planned', 'Planirano')}</p>
                        <p className="font-mono font-semibold">{formatAmount(totalPlanned)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('budget.actualLabel', 'Stvarno')}</p>
                        <p className="font-mono font-semibold">{formatAmount(totalSpent)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground">{t('budget.deviation', 'Odstupanje')}</p>
                        <p className="font-mono font-semibold">
                          {(() => {
                            const sign = totalDeviation > 0 ? '+' : totalDeviation < 0 ? '−' : '±';
                            return `${sign}${formatAmount(Math.abs(totalDeviation))}`;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="members" className="mt-4">
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
      </DialogContent>
    </Dialog>
  );
};
