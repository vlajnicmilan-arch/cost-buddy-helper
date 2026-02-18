import { useMemo } from 'react';
import { useExpenses } from '@/hooks/useExpenses';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useCurrency } from '@/contexts/CurrencyContext';

import { SummaryCard } from '@/components/SummaryCard';
import { getCategoryInfo, CATEGORIES } from '@/types/expense';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  ArrowLeftRight,
  Loader2,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Target
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  food: 'hsl(var(--category-food))',
  groceries: 'hsl(var(--category-groceries))',
  transport: 'hsl(var(--category-transport))',
  car: 'hsl(var(--category-car))',
  shopping: 'hsl(var(--category-shopping))',
  clothing: 'hsl(var(--category-clothing))',
  entertainment: 'hsl(var(--category-entertainment))',
  subscriptions: 'hsl(var(--category-subscriptions))',
  bills: 'hsl(var(--category-bills))',
  utilities: 'hsl(var(--category-utilities))',
  rent: 'hsl(var(--category-rent))',
  health: 'hsl(var(--category-health))',
  beauty: 'hsl(var(--category-beauty))',
  sports: 'hsl(var(--category-sports))',
  education: 'hsl(var(--category-education))',
  travel: 'hsl(var(--category-travel))',
  home: 'hsl(var(--category-home))',
  pets: 'hsl(var(--category-pets))',
  gifts: 'hsl(var(--category-gifts))',
  kids: 'hsl(var(--category-kids))',
  insurance: 'hsl(var(--category-insurance))',
  taxes: 'hsl(var(--category-taxes))',
  savings: 'hsl(var(--category-savings))',
  investments: 'hsl(var(--category-investments))',
  charity: 'hsl(var(--category-charity))',
  other: 'hsl(var(--category-other))',
};

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const { formatAmount, currency } = useCurrency();
  const navigate = useNavigate();
  
  
  const { 
    expenses, 
    loading: expensesLoading,
    totalExpenses, 
    totalIncome, 
    totalTransfers,
    balance,
    expensesByCategory,
    isLocalMode,
  } = useExpenses();

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/auth');
    }
  }, [user, authLoading, navigate, storageMode]);

  // Monthly trend data (last 6 months)
  const monthlyTrendData = useMemo(() => {
    const now = new Date();
    const months: { month: string; income: number; expenses: number; balance: number }[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const monthName = date.toLocaleDateString('hr-HR', { month: 'short' });
      
      const monthExpenses = expenses.filter(e => {
        const expDate = e.date;
        return expDate >= date && expDate <= monthEnd;
      });
      
      const income = monthExpenses.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
      const exp = monthExpenses.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
      
      months.push({
        month: monthName,
        income,
        expenses: exp,
        balance: income - exp,
      });
    }
    
    return months;
  }, [expenses]);

  // Category distribution data
  const categoryChartData = useMemo(() => {
    return Object.entries(expensesByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([categoryId, amount]) => {
        const info = getCategoryInfo(categoryId as any);
        return {
          name: info.name,
          value: amount,
          icon: info.icon,
          color: CATEGORY_COLORS[categoryId] || 'hsl(var(--muted-foreground))',
        };
      });
  }, [expensesByCategory]);

  // Income distribution (by category since income sources removed)
  const incomeSourceData = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    
    expenses
      .filter(e => e.type === 'income')
      .forEach(e => {
        const name = e.category || 'Ostalo';
        categoryMap[name] = (categoryMap[name] || 0) + e.amount;
      });
    
    return Object.entries(categoryMap).map(([name, amount]) => ({
      name,
      value: amount,
    }));
  }, [expenses]);

  // Daily spending for current month
  const dailySpendingData = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const days: { day: string; amount: number }[] = [];
    
    for (let d = new Date(monthStart); d <= today; d.setDate(d.getDate() + 1)) {
      const dayStr = d.getDate().toString();
      const dayExpenses = expenses.filter(e => {
        const expDate = e.date;
        return e.type === 'expense' && 
               expDate.getDate() === d.getDate() && 
               expDate.getMonth() === d.getMonth() &&
               expDate.getFullYear() === d.getFullYear();
      }).reduce((sum, e) => sum + e.amount, 0);
      
      days.push({ day: dayStr, amount: dayExpenses });
    }
    
    return days;
  }, [expenses]);

  // Statistics
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = expenses.filter(e => {
      const d = e.date;
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    
    const lastMonth = expenses.filter(e => {
      const d = e.date;
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    });
    
    const thisMonthExpenses = thisMonth.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    const lastMonthExpenses = lastMonth.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    
    const avgDailySpend = dailySpendingData.length > 0 
      ? dailySpendingData.reduce((sum, d) => sum + d.amount, 0) / dailySpendingData.length 
      : 0;
    
    const expenseChange = lastMonthExpenses > 0 
      ? ((thisMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100 
      : 0;
    
    return {
      transactionCount: expenses.length,
      thisMonthExpenses,
      lastMonthExpenses,
      avgDailySpend,
      expenseChange,
      topCategory: categoryChartData[0]?.name || 'N/A',
    };
  }, [expenses, dailySpendingData, categoryChartData]);

  const formatCurrency = formatAmount;

  const formatAxisCurrency = (amount: number) =>
    new Intl.NumberFormat(currency.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ` ${currency.symbol}`;

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && storageMode === 'cloud') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8"
      >
        <PageHeader title="Dashboard" />

        {expensesLoading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Summary Cards Row */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-8">
              <SummaryCard
                title="Stanje"
                amount={balance}
                variant="balance"
                icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5" />}
              />
              <SummaryCard
                title="Prihodi"
                amount={totalIncome}
                variant="income"
                icon={<TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />}
              />
              <SummaryCard
                title="Troškovi"
                amount={totalExpenses}
                variant="expense"
                icon={<TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />}
              />
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl sm:rounded-2xl p-3 sm:p-6"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">Prijenosi</span>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center bg-primary/10 text-primary">
                    <ArrowLeftRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <p className="text-lg sm:text-2xl font-mono font-bold text-muted-foreground">
                  {formatCurrency(totalTransfers)}
                </p>
              </motion.div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-3 sm:p-4 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground mb-1 sm:mb-2">
                  <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-[10px] sm:text-xs">Transakcije</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold">{stats.transactionCount}</p>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="p-3 sm:p-4 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground mb-1 sm:mb-2">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-[10px] sm:text-xs">Prosj. dnevno</span>
                </div>
                <p className="text-base sm:text-2xl font-bold font-mono">{formatCurrency(stats.avgDailySpend)}</p>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-3 sm:p-4 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground mb-1 sm:mb-2">
                  <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-[10px] sm:text-xs">Top kategorija</span>
                </div>
                <p className="text-sm sm:text-lg font-semibold truncate">{stats.topCategory}</p>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="p-3 sm:p-4 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground mb-1 sm:mb-2">
                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-[10px] sm:text-xs">Vs. prošli mj.</span>
                </div>
                <p className={cn(
                  "text-xl sm:text-2xl font-bold",
                  stats.expenseChange > 0 ? 'text-expense' : stats.expenseChange < 0 ? 'text-income' : ''
                )}>
                  {stats.expenseChange > 0 ? '+' : ''}{stats.expenseChange.toFixed(1)}%
                </p>
              </motion.div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-4 sm:mb-8">
              {/* Monthly Trend Chart */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6"
              >
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  <h3 className="text-base sm:text-lg font-semibold">Trend (6 mjeseci)</h3>
                </div>
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrendData} margin={{ left: -10, right: 5 }}>
                      <defs>
                        <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--income))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--income))" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--expense))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--expense))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickFormatter={formatAxisCurrency} width={55} />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="income" 
                        stroke="hsl(var(--income))" 
                        fill="url(#incomeGradient)"
                        strokeWidth={2}
                        name="Prihodi"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="expenses" 
                        stroke="hsl(var(--expense))" 
                        fill="url(#expenseGradient)"
                        strokeWidth={2}
                        name="Troškovi"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Two Column Charts for larger screens */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

              {/* Category Distribution */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6"
              >
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  <h3 className="text-base sm:text-lg font-semibold">Raspodjela troškova</h3>
                </div>
                <div className="h-48 sm:h-64">
                  {categoryChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          cx="50%"
                          cy="45%"
                          innerRadius={35}
                          outerRadius={60}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '0.5rem',
                            fontSize: '12px',
                          }}
                        />
                        <Legend 
                          formatter={(value) => <span className="text-[10px] sm:text-xs">{value}</span>}
                          wrapperStyle={{ fontSize: '10px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Nema podataka o troškovima
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Daily Spending */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6"
              >
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  <h3 className="text-base sm:text-lg font-semibold">Dnevna potrošnja</h3>
                </div>
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailySpendingData} margin={{ left: -15, right: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis 
                        dataKey="day" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} 
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                        tickFormatter={formatAxisCurrency} 
                        width={50}
                      />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => `Dan ${label}`}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                        }}
                      />
                      <Bar 
                        dataKey="amount" 
                        fill="hsl(var(--expense))" 
                        radius={[2, 2, 0, 0]}
                        name="Potrošnja"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Income Sources */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6"
              >
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-income" />
                  <h3 className="text-base sm:text-lg font-semibold">Izvori prihoda</h3>
                </div>
                <div className="h-48 sm:h-64">
                  {incomeSourceData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeSourceData} layout="vertical" margin={{ left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickFormatter={formatAxisCurrency} />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={70}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        />
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '0.5rem',
                            fontSize: '12px',
                          }}
                        />
                        <Bar 
                          dataKey="value" 
                          fill="hsl(var(--income))" 
                          radius={[0, 4, 4, 0]}
                          name="Prihod"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Nema podataka o prihodima
                    </div>
                  )}
                </div>
              </motion.div>
              </div>
            </div>

            {/* Monthly Comparison Table */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6"
            >
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <h3 className="text-base sm:text-lg font-semibold">Mjesečni pregled</h3>
              </div>
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full text-xs sm:text-sm min-w-[300px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 sm:py-3 px-2 font-medium text-muted-foreground">Mjesec</th>
                      <th className="text-right py-2 sm:py-3 px-1 sm:px-2 font-medium text-muted-foreground">Prihodi</th>
                      <th className="text-right py-2 sm:py-3 px-1 sm:px-2 font-medium text-muted-foreground">Troškovi</th>
                      <th className="text-right py-2 sm:py-3 px-2 font-medium text-muted-foreground">Stanje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTrendData.map((month, index) => (
                      <tr key={index} className="border-b border-border/30">
                        <td className="py-2 sm:py-3 px-2 font-medium">{month.month}</td>
                        <td className="py-2 sm:py-3 px-1 sm:px-2 text-right font-mono text-income">{formatCurrency(month.income)}</td>
                        <td className="py-2 sm:py-3 px-1 sm:px-2 text-right font-mono text-expense">{formatCurrency(month.expenses)}</td>
                        <td className={cn(
                          "py-2 sm:py-3 px-2 text-right font-mono font-semibold",
                          month.balance >= 0 ? 'text-income' : 'text-expense'
                        )}>
                          {formatCurrency(month.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
      <BottomNav />
    </div>
  );
};

export default Dashboard;
