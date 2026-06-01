import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useRecurringTransactions, RecurringTransaction } from '@/hooks/useRecurringTransactions';
import { useInstallments } from '@/hooks/useInstallments';
import { useFamilyForecastObligations } from '@/hooks/useFamilyForecastObligations';
import { computeFamilyOutflowsPerWeek } from '@/lib/familyForecastContrib';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, ArrowRight, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { addDays, addWeeks, addMonths, addYears, format, isWithinInterval, startOfDay } from 'date-fns';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ForecastWeek {
  label: string;
  income: number;
  expenses: number;
  net: number;
  cumulative: number;
}

function getNextOccurrences(
  recurring: RecurringTransaction,
  from: Date,
  to: Date
): Date[] {
  if (!recurring.is_active) return [];
  
  const dates: Date[] = [];
  let current = new Date(recurring.next_due_date);
  
  // If current is before from, advance it
  while (current < from) {
    current = advanceDate(current, recurring.frequency, recurring.day_of_month, recurring.day_of_week);
  }
  
  // Collect all occurrences within range
  while (current <= to) {
    dates.push(new Date(current));
    current = advanceDate(current, recurring.frequency, recurring.day_of_month, recurring.day_of_week);
  }
  
  return dates;
}

function advanceDate(
  date: Date,
  frequency: string,
  dayOfMonth: number | null,
  dayOfWeek: number | null
): Date {
  switch (frequency) {
    case 'daily': return addDays(date, 1);
    case 'weekly': return addDays(date, 7);
    case 'biweekly': return addDays(date, 14);
    case 'monthly': {
      const next = addMonths(date, 1);
      if (dayOfMonth) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      return next;
    }
    case 'yearly': return addYears(date, 1);
    default: return addMonths(date, 1);
  }
}

export const CashflowForecast = () => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { recurringTransactions } = useRecurringTransactions();
  const { plans } = useInstallments();
  const { settlements: familyObligations } = useFamilyForecastObligations();

  const forecastData = useMemo(() => {
    const today = startOfDay(new Date());
    const weeks: ForecastWeek[] = [];
    let cumulative = 0;

    const weekRanges = Array.from({ length: 8 }, (_, w) => {
      const ws = addWeeks(today, w);
      return { start: ws, end: addDays(ws, 6) };
    });
    const familyPerWeek = computeFamilyOutflowsPerWeek(
      familyObligations,
      // current user id is encoded in `debtor_user_id` filter on the hook already
      familyObligations[0]?.debtor_user_id || '',
      weekRanges,
    );



    for (let w = 0; w < 8; w++) {
      const weekStart = addWeeks(today, w);
      const weekEnd = addDays(weekStart, 6);
      
      let weekIncome = 0;
      let weekExpenses = 0;

      // Process recurring transactions
      for (const rec of recurringTransactions) {
        const occurrences = getNextOccurrences(rec, weekStart, weekEnd);
        for (const _ of occurrences) {
          if (rec.type === 'income') {
            weekIncome += rec.amount;
          } else if (rec.type === 'expense') {
            weekExpenses += rec.amount;
          }
        }
      }

      // Process upcoming installments
      for (const plan of plans) {
        for (const inst of (plan.installments || [])) {
          if (inst.status === 'planned') {
            const dueDate = inst.due_date instanceof Date ? inst.due_date : new Date(inst.due_date);
            if (isWithinInterval(dueDate, { start: weekStart, end: weekEnd })) {
              if (plan.type === 'income') {
                weekIncome += inst.amount;
              } else {
                weekExpenses += inst.amount;
              }
            }
          }
        }
      }

      // Family obligations (current user as debtor, pending)
      weekExpenses += familyPerWeek[w] || 0;

      const net = weekIncome - weekExpenses;
      cumulative += net;

      weeks.push({
        label: w === 0 
          ? t('dashboard.cashflow.thisWeek') 
          : `${format(weekStart, 'dd.MM')}`,
        income: weekIncome,
        expenses: weekExpenses,
        net,
        cumulative,
      });
    }

    return weeks;
  }, [recurringTransactions, plans, familyObligations, t]);

  const familyTotal = useMemo(
    () => familyObligations.reduce((s, r) => s + Number(r.amount || 0), 0),
    [familyObligations],
  );


  const totalProjectedIncome = forecastData.reduce((s, w) => s + w.income, 0);
  const totalProjectedExpenses = forecastData.reduce((s, w) => s + w.expenses, 0);
  const totalNet = totalProjectedIncome - totalProjectedExpenses;

  const hasData = totalProjectedIncome > 0 || totalProjectedExpenses > 0;

  const formatAxisCurrency = (amount: number) =>
    new Intl.NumberFormat(currency.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ` ${currency.symbol}`;

  if (!hasData) return (
    <p className="text-sm text-muted-foreground text-center py-4">
      {t('dashboard.cashflow.noData', 'Nema podataka za prognozu. Dodajte ponavljajuće transakcije ili rate.')}
    </p>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28 }}
    >

      {familyTotal > 0 && (
        <div className="flex justify-end mb-2">
          <Badge variant="secondary" className="gap-1 text-[10px] h-5">
            <Users className="w-3 h-3" />
            {t('dashboard.cashflow.familyObligations.chip', { amount: formatAmount(familyTotal) })}
          </Badge>
        </div>
      )}

      {/* Summary row */}

      <div className="grid grid-cols-3 gap-2 mb-3 sm:mb-4">
        <div className="p-2 sm:p-3 rounded-lg bg-income/10 text-center">
          <div className="flex items-center justify-center gap-1 text-income mb-0.5">
            <TrendingUp className="w-3 h-3" />
            <span className="text-[10px] sm:text-xs">{t('dashboard.cashflow.projectedIncome')}</span>
          </div>
          <p className="text-xs sm:text-sm font-mono font-bold text-income">
            +{formatAmount(totalProjectedIncome)}
          </p>
        </div>
        <div className="p-2 sm:p-3 rounded-lg bg-expense/10 text-center">
          <div className="flex items-center justify-center gap-1 text-expense mb-0.5">
            <TrendingDown className="w-3 h-3" />
            <span className="text-[10px] sm:text-xs">{t('dashboard.cashflow.projectedExpenses')}</span>
          </div>
          <p className="text-xs sm:text-sm font-mono font-bold text-expense">
            -{formatAmount(totalProjectedExpenses)}
          </p>
        </div>
        <div className={cn(
          "p-2 sm:p-3 rounded-lg text-center",
          totalNet >= 0 ? 'bg-income/10' : 'bg-expense/10'
        )}>
          <span className="text-[10px] sm:text-xs text-muted-foreground">{t('dashboard.cashflow.netFlow')}</span>
          <p className={cn(
            "text-xs sm:text-sm font-mono font-bold",
            totalNet >= 0 ? 'text-income' : 'text-expense'
          )}>
            {totalNet >= 0 ? '+' : ''}{formatAmount(totalNet)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-40 sm:h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecastData} margin={{ left: -10, right: 5 }}>
            <defs>
              <linearGradient id="forecastCumGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis 
              dataKey="label" 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} 
            />
            <YAxis 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
              tickFormatter={formatAxisCurrency} 
              width={55} 
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  income: t('dashboard.incomeLabel'),
                  expenses: t('dashboard.expensesLabel'),
                  cumulative: t('dashboard.cashflow.cumulative'),
                };
                return [formatAmount(value), labels[name] || name];
              }}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderColor: 'hsl(var(--border))',
                borderRadius: '0.5rem',
                fontSize: '12px',
              }}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="hsl(var(--primary))"
              fill="url(#forecastCumGradient)"
              strokeWidth={2}
              name="cumulative"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 text-center">
        {t('dashboard.cashflow.basedOn')}
      </p>
    </motion.div>
  );
};
