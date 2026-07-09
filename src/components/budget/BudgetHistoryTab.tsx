import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { BudgetWithStats } from '@/types/budget';
import { Expense } from '@/types/expense';
import { CATEGORIES } from '@/types/expense';
import { getDeviationVisual } from '@/lib/deviationVisual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Loader2,
  Calendar
} from 'lucide-react';
import { 
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  subMonths, subWeeks, subQuarters, subYears,
  addMonths, addWeeks, addQuarters, addYears,
  format, isSameMonth, isBefore, isAfter
} from 'date-fns';
import { hr } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { motion } from 'framer-motion';

interface BudgetHistoryTabProps {
  budget: BudgetWithStats;
}

interface PeriodData {
  label: string;
  start: Date;
  end: Date;
  spent: number;
  limit: number;
  percentage: number;
  categoryBreakdown: { category: string; name: string; icon: string; spent: number; limit: number; percentage: number }[];
  transactionCount: number;
}

export const BudgetHistoryTab = ({ budget }: BudgetHistoryTabProps) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0); // 0 = current

  // Fetch all expenses for this budget (no date filter)
  const fetchAllBudgetExpenses = useCallback(async () => {
    if (!budget?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('budget_id', budget.id)
        .eq('type', 'expense')
        .order('date', { ascending: false });
      if (error) throw error;
      setAllExpenses((data || []).map(e => ({
        ...e,
        date: new Date(e.date),
        amount: Number(e.amount),
        type: e.type as any,
        category: e.category as any,
        payment_source: e.payment_source as any,
        expense_nature: e.expense_nature as 'regular' | 'extraordinary' | undefined,
      })));
    } catch (err) {
      console.error('Error fetching budget history:', err);
    } finally {
      setLoading(false);
    }
  }, [budget?.id]);

  useEffect(() => {
    fetchAllBudgetExpenses();
  }, [fetchAllBudgetExpenses]);

  // Generate period ranges based on budget period type
  const periods = useMemo((): PeriodData[] => {
    const now = new Date();
    const periodType = budget.period_type;
    const count = 12; // Show up to 12 periods back
    const result: PeriodData[] = [];

    for (let i = 0; i < count; i++) {
      let start: Date, end: Date, label: string;

      if (periodType === 'weekly') {
        const d = subWeeks(now, i);
        start = startOfWeek(d, { weekStartsOn: 1 });
        end = endOfWeek(d, { weekStartsOn: 1 });
        label = `${format(start, 'd. MMM', { locale: hr })} - ${format(end, 'd. MMM', { locale: hr })}`;
      } else if (periodType === 'quarterly') {
        const d = subQuarters(now, i);
        start = startOfQuarter(d);
        end = endOfQuarter(d);
        label = `Q${Math.ceil((start.getMonth() + 1) / 3)} ${start.getFullYear()}`;
      } else if (periodType === 'yearly') {
        const d = subYears(now, i);
        start = startOfYear(d);
        end = endOfYear(d);
        label = d.getFullYear().toString();
      } else {
        // Default: monthly
        const d = subMonths(now, i);
        start = startOfMonth(d);
        end = endOfMonth(d);
        label = format(d, 'LLLL yyyy', { locale: hr });
      }

      // Filter expenses for this period
      const periodExpenses = allExpenses.filter(e => {
        return e.date >= start && e.date <= end;
      });

      const spent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);

      // Category breakdown
      const categoryMap = new Map<string, { icon: string; name: string; spent: number; limit: number }>();

      const resolveCat = (catId: string, fallbackIcon?: string) => {
        const sys = CATEGORIES.find(c => c.id === catId);
        if (sys) return { name: sys.name, icon: sys.icon };
        return { name: catId, icon: fallbackIcon || '📂' };
      };

      // Initialize from budget categories
      budget.categories.forEach(cat => {
        const info = resolveCat(cat.category, cat.icon);
        categoryMap.set(cat.category, {
          icon: info.icon,
          name: info.name,
          spent: 0,
          limit: cat.limit_amount,
        });
      });

      // Sum expenses per category
      periodExpenses.forEach(e => {
        const matchedCat = budget.categories.find(cat => {
          if (e.category === cat.category) return true;
          return false;
        });

        const catKey = matchedCat?.category || 'other';
        const existing = categoryMap.get(catKey);
        if (existing) {
          existing.spent += e.amount;
        } else {
          const info = resolveCat(catKey);
          categoryMap.set(catKey, { icon: info.icon, name: info.name, spent: e.amount, limit: 0 });
        }
      });

      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        name: data.name,
        icon: data.icon,
        spent: data.spent,
        limit: data.limit,
        percentage: data.limit > 0 ? (data.spent / data.limit) * 100 : 0,
      })).filter(c => c.spent > 0 || c.limit > 0);

      result.push({
        label: label.charAt(0).toUpperCase() + label.slice(1),
        start,
        end,
        spent,
        limit: budget.total_amount,
        percentage: budget.total_amount > 0 ? (spent / budget.total_amount) * 100 : 0,
        categoryBreakdown,
        transactionCount: periodExpenses.length,
      });
    }

    return result;
  }, [allExpenses, budget]);

  // Current and comparison periods
  const currentPeriod = periods[selectedPeriodIndex];
  const previousPeriod = periods[selectedPeriodIndex + 1];

  // Chart data - last 6 visible periods
  const chartData = useMemo(() => {
    return periods.slice(0, 6).reverse().map(p => ({
      name: p.label.length > 12 ? p.label.substring(0, 12) + '…' : p.label,
      spent: p.spent,
      limit: p.limit,
    }));
  }, [periods]);

  const getChangePercent = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentPeriod) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        {t('budget.noHistory', 'Nema povijesnih podataka')}
      </div>
    );
  }

  const spentChange = previousPeriod ? getChangePercent(currentPeriod.spent, previousPeriod.spent) : 0;

  return (
    <div className="space-y-5">
      {/* Period Navigator */}
      <div className="flex items-center justify-between bg-card rounded-xl border border-border p-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={selectedPeriodIndex >= periods.length - 1}
          onClick={() => setSelectedPeriodIndex(prev => prev + 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-sm">{currentPeriod.label}</p>
          <p className="text-xs text-muted-foreground">
            {currentPeriod.transactionCount} {t('budget.transactions', 'transakcija')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={selectedPeriodIndex <= 0}
          onClick={() => setSelectedPeriodIndex(prev => prev - 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Period Summary Card */}
      <motion.div
        key={selectedPeriodIndex}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="p-4 rounded-xl bg-card border border-border space-y-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t('budget.spent', 'Stvarno')}</span>
          <span className="text-sm text-muted-foreground">
            {currentPeriod.percentage.toFixed(0)}% {t('budget.ofFrame', 'okvira')}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <p className="font-mono font-bold text-2xl">{formatAmount(currentPeriod.spent)}</p>
          <p className="text-sm text-muted-foreground">/ {formatAmount(currentPeriod.limit)}</p>
        </div>

        {/* Progress bar — Smjer v1: neutralno (bg-module), bez alarm palete. */}
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-module"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(currentPeriod.percentage, 100)}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        {/* Comparison with previous — informativno, bez destructive tona */}
        {previousPeriod && (
          <div className="pt-2 border-t border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('budget.vsPrevPeriod', 'u odnosu na prošli period')} ({previousPeriod.label}):</span>
              <span className="font-medium text-muted-foreground">
                {formatAmount(previousPeriod.spent)}
              </span>
            </div>
            {(() => {
              const v = getDeviationVisual(spentChange);
              return (
                <Badge variant="secondary" className={cn("gap-1 text-xs bg-transparent", v.className)}>
                  {spentChange > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : spentChange < 0 ? (
                    <TrendingDown className="w-3 h-3" />
                  ) : (
                    <Minus className="w-3 h-3" />
                  )}
                  {spentChange > 0 ? '+' : ''}{spentChange.toFixed(0)}%
                </Badge>
              );
            })()}
          </div>
        )}
      </motion.div>

      {/* Category Comparison */}
      {currentPeriod.categoryBreakdown.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{t('budget.categoryComparison', 'Usporedba po kategorijama')}</h4>
          <div className="space-y-2">
            {currentPeriod.categoryBreakdown.map(cat => {
              const prevCat = previousPeriod?.categoryBreakdown.find(c => c.category === cat.category);
              const catChange = prevCat ? getChangePercent(cat.spent, prevCat.spent) : 0;

              return (
                <motion.div
                  key={cat.category}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-muted/30 border border-border/30"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat.icon}</span>
                      <span className="text-sm font-medium">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">{formatAmount(cat.spent)}</span>
                      {prevCat && Math.abs(catChange) > 5 && (() => {
                        const v = getDeviationVisual(catChange);
                        return (
                          <span className={cn("text-xs font-medium", v.className)}>
                            {catChange > 0 ? '↑' : '↓'}{Math.abs(catChange).toFixed(0)}%
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  {cat.limit > 0 && (
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all bg-module"
                        style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                      />
                    </div>
                  )}
                  {prevCat && (
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span>{previousPeriod?.label}: {formatAmount(prevCat.spent)}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>{currentPeriod.label}: {formatAmount(cat.spent)}</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historical Chart */}
      {chartData.some(d => d.spent > 0) && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{t('budget.spendingOverTime', 'Potrošnja kroz vrijeme')}</h4>
          <div className="p-3 rounded-xl bg-card border border-border">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={4}>
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    formatter={(val: number, name: string) => [
                      formatAmount(val),
                      name === 'spent' ? t('budget.spent', 'Stvarno') : t('budget.limit', 'Okvir')
                    ]}
                  />
                  <Bar 
                    name="spent" 
                    dataKey="spent" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                    opacity={0.85}
                  />
                  <Bar 
                    name="limit" 
                    dataKey="limit" 
                    fill="hsl(var(--muted-foreground))" 
                    radius={[4, 4, 0, 0]}
                    opacity={0.2}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      {/* Bottom spacer for scroll */}
      <div className="pb-8" />
    </div>
  );
};
