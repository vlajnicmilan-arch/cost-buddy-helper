import { useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { FlatrateLimitWidget } from './FlatrateLimitWidget';
import { KPIDashboardWidget } from './KPIDashboardWidget';
import { isModuleEnabled, type ModuleId, type IndustryType } from '@/lib/businessModules';
import { useTranslation } from 'react-i18next';

interface Props {
  expenses: Expense[];
  totalReceivable: number;
  totalPayable: number;
  enabledModules?: string[];
  industryType?: string;
}

const COLORS = ['hsl(172,66%,40%)', 'hsl(0,72%,55%)', 'hsl(43,96%,56%)', 'hsl(199,89%,48%)', 'hsl(280,60%,55%)', 'hsl(24,95%,53%)'];

export const BusinessDashboard = ({ expenses, totalReceivable, totalPayable, enabledModules = [], industryType = 'other' }: Props) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));

  const stats = useMemo(() => {
    const thisMonth = expenses.filter(e => e.date >= monthStart && e.date <= monthEnd);
    const prevMonth = expenses.filter(e => e.date >= prevMonthStart && e.date <= prevMonthEnd);

    const income = thisMonth.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const expense = thisMonth.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const prevIncome = prevMonth.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const prevExpense = prevMonth.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

    const catMap = new Map<string, number>();
    thisMonth.filter(e => e.type === 'expense').forEach(e => {
      catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount);
    });
    const categories = Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const trend = Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(now, 5 - i);
      const ms = startOfMonth(m);
      const me = endOfMonth(m);
      const mExpenses = expenses.filter(e => e.date >= ms && e.date <= me);
      return {
        name: format(m, 'MMM'),
        income: mExpenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0),
        expense: mExpenses.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0),
      };
    });

    return { income, expense, profit: income - expense, prevIncome, prevExpense, categories, trend };
  }, [expenses, monthStart, monthEnd, prevMonthStart, prevMonthEnd]);

  const incomeChange = stats.prevIncome ? ((stats.income - stats.prevIncome) / stats.prevIncome * 100).toFixed(0) : '0';
  const expenseChange = stats.prevExpense ? ((stats.expense - stats.prevExpense) / stats.prevExpense * 100).toFixed(0) : '0';

  return (
    <div className="space-y-4">
      {isModuleEnabled(enabledModules, 'flatrate_limit') && (
        <FlatrateLimitWidget expenses={expenses} />
      )}
      {isModuleEnabled(enabledModules, 'kpi_dashboard') && (
        <KPIDashboardWidget expenses={expenses} industryType={industryType as IndustryType} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-none shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-income" />
              <span className="text-xs text-muted-foreground">{t('business.dashboard.income', 'Prihodi')}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatAmount(stats.income)}</p>
            <p className={`text-[10px] ${Number(incomeChange) >= 0 ? 'text-income' : 'text-expense'}`}>
              {Number(incomeChange) >= 0 ? '+' : ''}{incomeChange}% {t('business.dashboard.vsLastMonth', 'vs prošli mj.')}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDownRight className="w-3.5 h-3.5 text-expense" />
              <span className="text-xs text-muted-foreground">{t('business.dashboard.expenses', 'Rashodi')}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatAmount(stats.expense)}</p>
            <p className={`text-[10px] ${Number(expenseChange) <= 0 ? 'text-income' : 'text-expense'}`}>
              {Number(expenseChange) >= 0 ? '+' : ''}{expenseChange}% {t('business.dashboard.vsLastMonth', 'vs prošli mj.')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t('business.dashboard.profitLoss', 'Dobit / Gubitak (ovaj mjesec)')}</p>
              <p className={`text-xl font-bold ${stats.profit >= 0 ? 'text-income' : 'text-expense'}`}>
                {stats.profit >= 0 ? '+' : ''}{formatAmount(stats.profit)}
              </p>
            </div>
            {stats.profit >= 0 ? (
              <TrendingUp className="w-8 h-8 text-income/30" />
            ) : (
              <TrendingDown className="w-8 h-8 text-expense/30" />
            )}
          </div>
        </CardContent>
      </Card>

      {(totalReceivable > 0 || totalPayable > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-none shadow-sm bg-income/5">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.receivables', 'Potraživanja')}</p>
              <p className="text-sm font-bold text-income">{formatAmount(totalReceivable)}</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-expense/5">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.payables', 'Dugovanja')}</p>
              <p className="text-sm font-bold text-expense">{formatAmount(totalPayable)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {stats.trend.some(t => t.income > 0 || t.expense > 0) && (
        <Card className="border-none shadow-sm">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm font-semibold">{t('business.dashboard.monthlyTrend', 'Mjesečni trend')}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-2">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.trend} barGap={2}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(val: number) => formatAmount(val)}
                  />
                  <Bar dataKey="income" name={t('business.dashboard.income', 'Prihodi')} fill="hsl(160,75%,42%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name={t('business.dashboard.expenses', 'Rashodi')} fill="hsl(0,72%,55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {stats.categories.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm font-semibold">{t('business.dashboard.topExpenseCategories', 'Top kategorije rashoda')}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-2">
            <div className="flex gap-3">
              <div className="w-24 h-24 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.categories} dataKey="value" cx="50%" cy="50%" innerRadius={20} outerRadius={40} paddingAngle={2}>
                      {stats.categories.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {stats.categories.map((cat, i) => (
                  <div key={cat.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground capitalize truncate max-w-[100px]">{cat.name}</span>
                    </div>
                    <span className="font-medium">{formatAmount(cat.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {expenses.length === 0 && (
        <Card className="border-none shadow-sm">
          <CardContent className="p-6 text-center">
            <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">{t('business.dashboard.noTransactions', 'Još nema poslovnih transakcija')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t('business.dashboard.addFirstHint', 'Dodajte prvu transakciju u kartici "Transakcije"')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
