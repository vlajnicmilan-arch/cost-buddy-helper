import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { IndustryType } from '@/lib/businessModules';
import { startOfMonth, endOfMonth, subMonths, format, differenceInDays, startOfYear, endOfYear } from 'date-fns';
import { TrendingUp, TrendingDown, Target, Percent, BarChart3, DollarSign, Package, Users, Activity } from 'lucide-react';

interface Props {
  expenses: Expense[];
  industryType: IndustryType;
}

interface KPI {
  label: string;
  value: string;
  subtext?: string;
  icon: any;
  color: 'income' | 'expense' | 'primary' | 'warning';
  progress?: number;
  target?: string;
}

export const KPIDashboardWidget = ({ expenses, industryType }: Props) => {
  const { formatAmount } = useCurrency();
  const now = new Date();

  const kpis = useMemo(() => {
    const ms = startOfMonth(now);
    const me = endOfMonth(now);
    const prevMs = startOfMonth(subMonths(now, 1));
    const prevMe = endOfMonth(subMonths(now, 1));
    const yearStart = startOfYear(now);

    const thisMonth = expenses.filter(e => new Date(e.date) >= ms && new Date(e.date) <= me);
    const prevMonth = expenses.filter(e => new Date(e.date) >= prevMs && new Date(e.date) <= prevMe);
    const thisYear = expenses.filter(e => new Date(e.date) >= yearStart);

    const mIncome = thisMonth.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const mExpense = thisMonth.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const prevIncome = prevMonth.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const prevExpense = prevMonth.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const yearIncome = thisYear.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const yearExpense = thisYear.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

    const profitMargin = mIncome > 0 ? ((mIncome - mExpense) / mIncome * 100) : 0;
    const incomeGrowth = prevIncome > 0 ? ((mIncome - prevIncome) / prevIncome * 100) : 0;

    // Days in month for average calculations
    const daysPassed = Math.max(1, differenceInDays(now, ms) + 1);
    const avgDailyIncome = mIncome / daysPassed;

    const result: KPI[] = [];

    // Universal KPIs
    result.push({
      label: 'Profitna marža',
      value: `${profitMargin.toFixed(1)}%`,
      subtext: mIncome > 0 ? `${formatAmount(mIncome - mExpense)} neto` : 'Nema prihoda',
      icon: Percent,
      color: profitMargin >= 0 ? 'income' : 'expense',
      progress: Math.min(100, Math.max(0, profitMargin)),
    });

    result.push({
      label: 'Rast prihoda',
      value: `${incomeGrowth >= 0 ? '+' : ''}${incomeGrowth.toFixed(0)}%`,
      subtext: `vs prošli mjesec (${formatAmount(prevIncome)})`,
      icon: incomeGrowth >= 0 ? TrendingUp : TrendingDown,
      color: incomeGrowth >= 0 ? 'income' : 'expense',
    });

    // Industry-specific KPIs
    switch (industryType) {
      case 'hospitality': {
        const foodCats = ['namirnice', 'food', 'hrana'];
        const beverageCats = ['piće', 'beverage', 'drinks'];
        const staffCats = ['osoblje', 'staff', 'plaće', 'wages'];
        const foodCost = thisMonth.filter(e => e.type === 'expense' && foodCats.some(c => e.category.toLowerCase().includes(c))).reduce((s, e) => s + e.amount, 0);
        const beverageCost = thisMonth.filter(e => e.type === 'expense' && beverageCats.some(c => e.category.toLowerCase().includes(c))).reduce((s, e) => s + e.amount, 0);
        const staffCost = thisMonth.filter(e => e.type === 'expense' && staffCats.some(c => e.category.toLowerCase().includes(c))).reduce((s, e) => s + e.amount, 0);
        const foodPct = mIncome > 0 ? (foodCost / mIncome * 100) : 0;
        const beveragePct = mIncome > 0 ? (beverageCost / mIncome * 100) : 0;
        const staffPct = mIncome > 0 ? (staffCost / mIncome * 100) : 0;

        result.push({
          label: 'Food Cost %',
          value: `${foodPct.toFixed(1)}%`,
          subtext: foodPct <= 30 ? '✅ Unutar cilja (<30%)' : '⚠️ Iznad cilja (>30%)',
          icon: Package,
          color: foodPct <= 30 ? 'income' : 'warning',
          progress: Math.min(100, foodPct),
          target: '30%',
        });
        result.push({
          label: 'Troškovi osoblja / Prihod',
          value: `${staffPct.toFixed(1)}%`,
          subtext: `${formatAmount(staffCost)} od ${formatAmount(mIncome)}`,
          icon: Users,
          color: staffPct <= 35 ? 'income' : 'warning',
        });
        result.push({
          label: 'Prosječni dnevni promet',
          value: formatAmount(avgDailyIncome),
          subtext: `${daysPassed} dana u mjesecu`,
          icon: BarChart3,
          color: 'primary',
        });
        break;
      }
      case 'retail': {
        const purchaseCats = ['nabava', 'purchase', 'roba'];
        const purchaseCost = thisMonth.filter(e => e.type === 'expense' && purchaseCats.some(c => e.category.toLowerCase().includes(c))).reduce((s, e) => s + e.amount, 0);
        const margin = mIncome > 0 ? ((mIncome - purchaseCost) / mIncome * 100) : 0;
        const avgTransaction = thisMonth.filter(e => e.type === 'income').length > 0
          ? mIncome / thisMonth.filter(e => e.type === 'income').length : 0;

        result.push({
          label: 'Marža (%)',
          value: `${margin.toFixed(1)}%`,
          subtext: `Nabava: ${formatAmount(purchaseCost)}`,
          icon: Percent,
          color: margin >= 20 ? 'income' : 'warning',
          progress: Math.min(100, margin),
        });
        result.push({
          label: 'Prosječna transakcija',
          value: formatAmount(avgTransaction),
          subtext: `${thisMonth.filter(e => e.type === 'income').length} prodaja`,
          icon: DollarSign,
          color: 'primary',
        });
        break;
      }
      case 'construction': {
        const materialCats = ['materijal', 'material'];
        const materialCost = thisMonth.filter(e => e.type === 'expense' && materialCats.some(c => e.category.toLowerCase().includes(c))).reduce((s, e) => s + e.amount, 0);
        const materialPct = mExpense > 0 ? (materialCost / mExpense * 100) : 0;

        result.push({
          label: 'Troškovi materijala',
          value: `${materialPct.toFixed(0)}%`,
          subtext: `${formatAmount(materialCost)} od ukupnih rashoda`,
          icon: Package,
          color: 'primary',
          progress: Math.min(100, materialPct),
        });
        break;
      }
      case 'flatrate': {
        const avgMonthlyIncome = yearIncome / Math.max(1, now.getMonth() + 1);
        result.push({
          label: 'Prosječni mjesečni prihod',
          value: formatAmount(avgMonthlyIncome),
          subtext: `Godišnji: ${formatAmount(yearIncome)}`,
          icon: BarChart3,
          color: 'primary',
        });
        break;
      }
      default:
        break;
    }

    // Universal: Top expense category
    const catMap = new Map<string, number>();
    thisMonth.filter(e => e.type === 'expense').forEach(e => catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount));
    const topCat = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topCat) {
      result.push({
        label: 'Najveći trošak',
        value: formatAmount(topCat[1]),
        subtext: topCat[0],
        icon: Activity,
        color: 'expense',
      });
    }

    // Year P&L
    result.push({
      label: 'Godišnja dobit/gubitak',
      value: formatAmount(yearIncome - yearExpense),
      subtext: `Prihodi: ${formatAmount(yearIncome)} | Rashodi: ${formatAmount(yearExpense)}`,
      icon: Target,
      color: yearIncome - yearExpense >= 0 ? 'income' : 'expense',
    });

    return result;
  }, [expenses, industryType, formatAmount]);

  const colorMap = {
    income: 'text-income',
    expense: 'text-expense',
    primary: 'text-primary',
    warning: 'text-yellow-500',
  };

  const bgMap = {
    income: 'bg-income/10',
    expense: 'bg-expense/10',
    primary: 'bg-primary/10',
    warning: 'bg-yellow-500/10',
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          KPI pokazatelji
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-2">
        <div className="grid grid-cols-2 gap-2">
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <div key={i} className="p-2.5 rounded-xl bg-muted/40 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-lg ${bgMap[kpi.color]} flex items-center justify-center`}>
                    <Icon className={`w-3 h-3 ${colorMap[kpi.color]}`} />
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</span>
                </div>
                <p className={`text-sm font-bold ${colorMap[kpi.color]}`}>{kpi.value}</p>
                {kpi.progress !== undefined && (
                  <Progress value={kpi.progress} className="h-1" />
                )}
                {kpi.subtext && (
                  <p className="text-[9px] text-muted-foreground leading-tight">{kpi.subtext}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
