import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, TrendingUp, Pencil, Check } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Expense } from '@/types/expense';
import { startOfYear, endOfYear, format, differenceInDays } from 'date-fns';

const DEFAULT_LIMIT = 39816.84;

interface Props {
  expenses: Expense[];
}

export const FlatrateLimitWidget = ({ expenses }: Props) => {
  const { formatAmount } = useCurrency();
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [editing, setEditing] = useState(false);
  const [tempLimit, setTempLimit] = useState(String(DEFAULT_LIMIT));

  const now = new Date();
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);

  const stats = useMemo(() => {
    const yearIncome = expenses
      .filter(e => e.type === 'income' && e.date >= yearStart && e.date <= yearEnd)
      .reduce((sum, e) => sum + e.amount, 0);

    const percentage = limit > 0 ? (yearIncome / limit) * 100 : 0;
    const remaining = Math.max(0, limit - yearIncome);

    // Projection
    const daysPassed = differenceInDays(now, yearStart) + 1;
    const totalDays = differenceInDays(yearEnd, yearStart) + 1;
    const dailyAvg = daysPassed > 0 ? yearIncome / daysPassed : 0;
    const projected = dailyAvg * totalDays;

    // Monthly breakdown
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const monthExpenses = expenses.filter(e => {
        if (e.type !== 'income') return false;
        const d = e.date;
        return d.getFullYear() === now.getFullYear() && d.getMonth() === i;
      });
      return {
        month: format(new Date(now.getFullYear(), i, 1), 'MMM'),
        amount: monthExpenses.reduce((s, e) => s + e.amount, 0),
      };
    });

    return { yearIncome, percentage, remaining, projected, monthlyData };
  }, [expenses, limit, yearStart, yearEnd, now]);

  const getAlertLevel = () => {
    if (stats.percentage >= 100) return 'critical';
    if (stats.percentage >= 90) return 'danger';
    if (stats.percentage >= 80) return 'warning';
    return 'safe';
  };

  const alertLevel = getAlertLevel();
  const alertColors = {
    safe: 'text-income',
    warning: 'text-yellow-500',
    danger: 'text-orange-500',
    critical: 'text-expense',
  };
  const progressColors = {
    safe: '[&>div]:bg-income',
    warning: '[&>div]:bg-yellow-500',
    danger: '[&>div]:bg-orange-500',
    critical: '[&>div]:bg-expense',
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="p-3 pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            📊 Paušalni limit {now.getFullYear()}
          </CardTitle>
          {!editing ? (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(true); setTempLimit(String(limit)); }}>
              <Pencil className="w-3 h-3" />
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={tempLimit}
                onChange={e => setTempLimit(e.target.value)}
                className="h-6 w-24 text-xs"
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setLimit(Number(tempLimit) || DEFAULT_LIMIT); setEditing(false); }}>
                <Check className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-2 space-y-3">
        {/* Progress */}
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <span className={`text-2xl font-bold ${alertColors[alertLevel]}`}>
              {stats.percentage.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">
              od {formatAmount(limit)}
            </span>
          </div>
          <Progress value={Math.min(stats.percentage, 100)} className={`h-3 ${progressColors[alertLevel]}`} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-muted/30">
            <p className="text-[10px] text-muted-foreground">Ostvareni prihod</p>
            <p className="text-sm font-bold">{formatAmount(stats.yearIncome)}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <p className="text-[10px] text-muted-foreground">Preostalo</p>
            <p className="text-sm font-bold text-income">{formatAmount(stats.remaining)}</p>
          </div>
        </div>

        {/* Projection */}
        <div className="p-2 rounded-lg bg-muted/30 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground">Projekcija do kraja godine</p>
            <p className={`text-sm font-bold ${stats.projected > limit ? 'text-expense' : 'text-income'}`}>
              {formatAmount(stats.projected)}
              {stats.projected > limit && (
                <span className="text-[10px] font-normal ml-1">⚠️ prelazi limit</span>
              )}
            </p>
          </div>
        </div>

        {/* Alert */}
        {alertLevel !== 'safe' && (
          <div className={`p-2 rounded-lg flex items-center gap-2 ${
            alertLevel === 'critical' ? 'bg-expense/10' :
            alertLevel === 'danger' ? 'bg-orange-500/10' : 'bg-yellow-500/10'
          }`}>
            <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${alertColors[alertLevel]}`} />
            <p className={`text-xs ${alertColors[alertLevel]}`}>
              {alertLevel === 'critical' && 'Prekoračili ste godišnji limit!'}
              {alertLevel === 'danger' && 'Blizu ste limita — još samo 10% do granice.'}
              {alertLevel === 'warning' && 'Pažnja — iskoristili ste 80% godišnjeg limita.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
