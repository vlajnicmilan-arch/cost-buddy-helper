import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Expense, getCategoryInfo, CATEGORIES } from '@/types/expense';
import { useIncomeSources } from '@/hooks/useIncomeSources';
import {
  FileText,
  Download,
  FileSpreadsheet,
  FileJson,
  Calendar,
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart as PieChartIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Minus,
  BarChart3,
  Banknote,
} from 'lucide-react';
import { generatePDFReport, generateCSVReport, generateJSONExport, ReportData } from '@/lib/reportExport';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface ReportsDialogProps {
  expenses: Expense[];
}

type PeriodPreset = 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'all' | 'custom';
type ComparePreset = 'month-vs-month' | 'year-vs-year' | 'custom';
type ChartType = 'pie' | 'bar';

const CATEGORY_COLORS: Record<string, string> = {
  food: '#f97316',
  groceries: '#fb923c',
  transport: '#3b82f6',
  car: '#60a5fa',
  shopping: '#ec4899',
  clothing: '#f472b6',
  entertainment: '#a855f7',
  subscriptions: '#c084fc',
  bills: '#6366f1',
  utilities: '#818cf8',
  rent: '#4f46e5',
  health: '#22c55e',
  beauty: '#4ade80',
  sports: '#86efac',
  education: '#14b8a6',
  travel: '#f59e0b',
  home: '#8b5cf6',
  pets: '#eab308',
  gifts: '#ef4444',
  kids: '#06b6d4',
  insurance: '#0ea5e9',
  taxes: '#64748b',
  savings: '#10b981',
  investments: '#059669',
  charity: '#dc2626',
  other: '#6b7280',
};

const calculateStats = (expenseList: Expense[]) => {
  const income = expenseList
    .filter(e => e.type === 'income')
    .reduce((sum, e) => sum + e.amount, 0);
  const expenseTotal = expenseList
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + e.amount, 0);
  const transfers = expenseList
    .filter(e => e.type === 'transfer')
    .reduce((sum, e) => sum + e.amount, 0);

  const byCategory: Record<string, number> = {};
  expenseList
    .filter(e => e.type === 'expense')
    .forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

  const byPaymentSource: Record<string, number> = {};
  expenseList.forEach(e => {
    const source = e.payment_source || 'cash';
    byPaymentSource[source] = (byPaymentSource[source] || 0) + e.amount;
  });

  const byIncomeSource: Record<string, { income: number; expenses: number; balance: number }> = {};
  expenseList
    .filter(e => e.income_source_id)
    .forEach(e => {
      if (!byIncomeSource[e.income_source_id!]) {
        byIncomeSource[e.income_source_id!] = { income: 0, expenses: 0, balance: 0 };
      }
      if (e.type === 'income') {
        byIncomeSource[e.income_source_id!].income += e.amount;
      } else if (e.type === 'expense') {
        byIncomeSource[e.income_source_id!].expenses += e.amount;
      }
    });
  Object.values(byIncomeSource).forEach(s => {
    s.balance = s.income - s.expenses;
  });

  return {
    income,
    expenses: expenseTotal,
    balance: income - expenseTotal,
    transfers,
    byCategory,
    byPaymentSource,
    byIncomeSource,
    transactionCount: expenseList.length,
  };
};

export const ReportsDialog = ({ expenses }: ReportsDialogProps) => {
  const { incomeSources } = useIncomeSources();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('report');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  // Chart state
  const [chartType, setChartType] = useState<ChartType>('pie');
  
  // Income source filter
  const [selectedIncomeSourceId, setSelectedIncomeSourceId] = useState<string>('all');
  
  // Comparison state
  const [comparePreset, setComparePreset] = useState<ComparePreset>('month-vs-month');
  const [customCompare1Start, setCustomCompare1Start] = useState('');
  const [customCompare1End, setCustomCompare1End] = useState('');
  const [customCompare2Start, setCustomCompare2Start] = useState('');
  const [customCompare2End, setCustomCompare2End] = useState('');

  const dateRange = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (periodPreset) {
      case 'this-month':
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: today,
        };
      case 'last-month':
        return {
          start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          end: new Date(now.getFullYear(), now.getMonth(), 0),
        };
      case 'this-year':
        return {
          start: new Date(now.getFullYear(), 0, 1),
          end: today,
        };
      case 'last-year':
        return {
          start: new Date(now.getFullYear() - 1, 0, 1),
          end: new Date(now.getFullYear() - 1, 11, 31),
        };
      case 'all':
        const dates = expenses.map(e => e.date.getTime());
        return {
          start: dates.length > 0 ? new Date(Math.min(...dates)) : today,
          end: today,
        };
      case 'custom':
        return {
          start: customStart ? new Date(customStart) : today,
          end: customEnd ? new Date(customEnd) : today,
        };
      default:
        return { start: today, end: today };
    }
  }, [periodPreset, customStart, customEnd, expenses]);

  // Comparison date ranges
  const compareDateRanges = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (comparePreset) {
      case 'month-vs-month':
        return {
          period1: {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: today,
            label: 'Ovaj mjesec',
          },
          period2: {
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            end: new Date(now.getFullYear(), now.getMonth(), 0),
            label: 'Prošli mjesec',
          },
        };
      case 'year-vs-year':
        return {
          period1: {
            start: new Date(now.getFullYear(), 0, 1),
            end: today,
            label: `${now.getFullYear()}`,
          },
          period2: {
            start: new Date(now.getFullYear() - 1, 0, 1),
            end: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
            label: `${now.getFullYear() - 1}`,
          },
        };
      case 'custom':
        return {
          period1: {
            start: customCompare1Start ? new Date(customCompare1Start) : today,
            end: customCompare1End ? new Date(customCompare1End) : today,
            label: 'Razdoblje 1',
          },
          period2: {
            start: customCompare2Start ? new Date(customCompare2Start) : today,
            end: customCompare2End ? new Date(customCompare2End) : today,
            label: 'Razdoblje 2',
          },
        };
      default:
        return {
          period1: { start: today, end: today, label: 'Razdoblje 1' },
          period2: { start: today, end: today, label: 'Razdoblje 2' },
        };
    }
  }, [comparePreset, customCompare1Start, customCompare1End, customCompare2Start, customCompare2End]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const expenseDate = e.date.getTime();
      const inDateRange = expenseDate >= dateRange.start.getTime() && expenseDate <= dateRange.end.getTime() + 86400000;
      
      // Filter by income source if selected
      if (selectedIncomeSourceId !== 'all') {
        if (selectedIncomeSourceId === 'unassigned') {
          return inDateRange && !e.income_source_id;
        }
        return inDateRange && e.income_source_id === selectedIncomeSourceId;
      }
      
      return inDateRange;
    });
  }, [expenses, dateRange, selectedIncomeSourceId]);

  // Comparison filtered expenses
  const compareExpenses1 = useMemo(() => {
    return expenses.filter(e => {
      const expenseDate = e.date.getTime();
      return expenseDate >= compareDateRanges.period1.start.getTime() && 
             expenseDate <= compareDateRanges.period1.end.getTime() + 86400000;
    });
  }, [expenses, compareDateRanges.period1]);

  const compareExpenses2 = useMemo(() => {
    return expenses.filter(e => {
      const expenseDate = e.date.getTime();
      return expenseDate >= compareDateRanges.period2.start.getTime() && 
             expenseDate <= compareDateRanges.period2.end.getTime() + 86400000;
    });
  }, [expenses, compareDateRanges.period2]);

  const stats = useMemo(() => calculateStats(filteredExpenses), [filteredExpenses]);
  const compareStats1 = useMemo(() => calculateStats(compareExpenses1), [compareExpenses1]);
  const compareStats2 = useMemo(() => calculateStats(compareExpenses2), [compareExpenses2]);

  const topCategories = useMemo(() => {
    return Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [stats.byCategory]);

  // Chart data for pie chart
  const chartData = useMemo(() => {
    return Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([categoryId, amount]) => {
        const info = getCategoryInfo(categoryId as any);
        return {
          name: info.name,
          value: amount,
          icon: info.icon,
          color: CATEGORY_COLORS[categoryId] || '#6b7280',
        };
      });
  }, [stats.byCategory]);

  // Category comparison
  const categoryComparison = useMemo(() => {
    const allCategories = new Set([
      ...Object.keys(compareStats1.byCategory),
      ...Object.keys(compareStats2.byCategory),
    ]);
    
    return Array.from(allCategories)
      .map(cat => {
        const amount1 = compareStats1.byCategory[cat] || 0;
        const amount2 = compareStats2.byCategory[cat] || 0;
        const diff = amount1 - amount2;
        const diffPercent = amount2 > 0 ? ((amount1 - amount2) / amount2) * 100 : (amount1 > 0 ? 100 : 0);
        return { category: cat, amount1, amount2, diff, diffPercent };
      })
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 8);
  }, [compareStats1.byCategory, compareStats2.byCategory]);

  // Comparison chart data
  const comparisonChartData = useMemo(() => {
    return categoryComparison.map(({ category, amount1, amount2 }) => {
      const info = getCategoryInfo(category as any);
      return {
        name: info.name,
        icon: info.icon,
        [compareDateRanges.period1.label]: amount1,
        [compareDateRanges.period2.label]: amount2,
      };
    });
  }, [categoryComparison, compareDateRanges]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatPercent = (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getDiffColor = (diff: number, inverse = false) => {
    if (diff === 0) return 'text-muted-foreground';
    if (inverse) {
      return diff > 0 ? 'text-expense' : 'text-income';
    }
    return diff > 0 ? 'text-income' : 'text-expense';
  };

  const getDiffIcon = (diff: number) => {
    if (diff === 0) return <Minus className="w-4 h-4" />;
    return diff > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const getReportData = (): ReportData => {
    // Get selected income source info
    let selectedIncomeSource: { id: string; name: string; icon: string } | null = null;
    if (selectedIncomeSourceId !== 'all') {
      if (selectedIncomeSourceId === 'unassigned') {
        selectedIncomeSource = { id: 'unassigned', name: 'Bez izvora', icon: '📭' };
      } else {
        const source = incomeSources.find(s => s.id === selectedIncomeSourceId);
        if (source) {
          selectedIncomeSource = { id: source.id, name: source.name, icon: source.icon || '💰' };
        }
      }
    }

    return {
      expenses: filteredExpenses,
      incomeSources,
      dateRange,
      totals: {
        income: stats.income,
        expenses: stats.expenses,
        balance: stats.balance,
        transfers: stats.transfers,
      },
      byCategory: stats.byCategory,
      byPaymentSource: stats.byPaymentSource,
      byIncomeSource: stats.byIncomeSource,
      selectedIncomeSource,
    };
  };

  const handleExportPDF = () => {
    try {
      generatePDFReport(getReportData());
      toast.success('PDF izvješće generirano!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Greška pri generiranju PDF-a');
    }
  };

  const handleExportCSV = () => {
    try {
      generateCSVReport(getReportData());
      toast.success('CSV datoteka generirana!');
    } catch (error) {
      console.error('Error generating CSV:', error);
      toast.error('Greška pri generiranju CSV-a');
    }
  };

  const handleExportJSON = () => {
    try {
      generateJSONExport(getReportData());
      toast.success('JSON datoteka generirana!');
    } catch (error) {
      console.error('Error generating JSON:', error);
      toast.error('Greška pri generiranju JSON-a');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white dark:bg-amber-600 dark:hover:bg-amber-700">
          <FileText className="w-4 h-4" />
          Izvješća
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5" />
            Financijsko izvješće
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="report" className="gap-2">
              <PieChart className="w-4 h-4" />
              Izvješće
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-2">
              <ArrowUpDown className="w-4 h-4" />
              Usporedba
            </TabsTrigger>
          </TabsList>

          {/* Report Tab */}
          <TabsContent value="report" className="space-y-6">
            {/* Period & Income Source Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Period Selection */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Odaberi razdoblje
                </Label>
                <Select value={periodPreset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this-month">Ovaj mjesec</SelectItem>
                    <SelectItem value="last-month">Prošli mjesec</SelectItem>
                    <SelectItem value="this-year">Ova godina</SelectItem>
                    <SelectItem value="last-year">Prošla godina</SelectItem>
                    <SelectItem value="all">Sve vrijeme</SelectItem>
                    <SelectItem value="custom">Prilagođeno</SelectItem>
                  </SelectContent>
                </Select>

                {periodPreset === 'custom' && (
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Od</Label>
                      <Input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Do</Label>
                      <Input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Income Source Filter */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Banknote className="w-4 h-4" />
                  Izvor prihoda
                </Label>
                <Select value={selectedIncomeSourceId} onValueChange={setSelectedIncomeSourceId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Svi izvori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        📊 Svi izvori
                      </span>
                    </SelectItem>
                    <SelectItem value="unassigned">
                      <span className="flex items-center gap-2">
                        📭 Bez izvora
                      </span>
                    </SelectItem>
                    {incomeSources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        <span className="flex items-center gap-2">
                          {source.icon} {source.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {dateRange.start.toLocaleDateString('hr-HR')} - {dateRange.end.toLocaleDateString('hr-HR')}
              <span className="ml-2">({stats.transactionCount} transakcija)</span>
              {selectedIncomeSourceId !== 'all' && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                  {selectedIncomeSourceId === 'unassigned' 
                    ? '📭 Bez izvora' 
                    : `${incomeSources.find(s => s.id === selectedIncomeSourceId)?.icon || ''} ${incomeSources.find(s => s.id === selectedIncomeSourceId)?.name || ''}`
                  }
                </span>
              )}
            </p>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-muted/50 border">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4 text-income" />
                  <span className="text-xs">Prihodi</span>
                </div>
                <p className="font-mono font-bold text-income">{formatCurrency(stats.income)}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50 border">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingDown className="w-4 h-4 text-expense" />
                  <span className="text-xs">Troškovi</span>
                </div>
                <p className="font-mono font-bold text-expense">{formatCurrency(stats.expenses)}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50 border">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Wallet className="w-4 h-4" />
                  <span className="text-xs">Stanje</span>
                </div>
                <p className={cn("font-mono font-bold", stats.balance >= 0 ? 'text-income' : 'text-expense')}>
                  {formatCurrency(stats.balance)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-muted/50 border">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <PieChart className="w-4 h-4" />
                  <span className="text-xs">Kategorija</span>
                </div>
                <p className="font-mono font-bold text-sm">
                  {Object.keys(stats.byCategory).length}
                </p>
              </div>
            </div>

            {/* Category Chart */}
            {chartData.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4" />
                    Troškovi po kategorijama
                  </Label>
                  <div className="flex gap-1 p-1 bg-muted rounded-lg">
                    <Button
                      variant={chartType === 'pie' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setChartType('pie')}
                    >
                      <PieChartIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={chartType === 'bar' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setChartType('bar')}
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartType === 'pie' ? (
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                      </PieChart>
                    ) : (
                      <BarChart data={chartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tickFormatter={(v) => `€${v}`} />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={80} 
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>

                {/* Category Legend */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {chartData.slice(0, 6).map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate flex-1">{item.icon} {item.name}</span>
                      <span className="font-mono text-xs">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Export Buttons */}
            <div className="space-y-3 pt-4 border-t">
              <Label className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Izvezi izvješće
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl h-auto py-4 flex-col"
                  onClick={handleExportPDF}
                  disabled={filteredExpenses.length === 0}
                >
                  <FileText className="w-6 h-6 text-destructive" />
                  <span>PDF</span>
                  <span className="text-xs text-muted-foreground">Izvješće</span>
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl h-auto py-4 flex-col"
                  onClick={handleExportCSV}
                  disabled={filteredExpenses.length === 0}
                >
                  <FileSpreadsheet className="w-6 h-6 text-income" />
                  <span>CSV</span>
                  <span className="text-xs text-muted-foreground">Excel/Sheets</span>
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl h-auto py-4 flex-col"
                  onClick={handleExportJSON}
                  disabled={filteredExpenses.length === 0}
                >
                  <FileJson className="w-6 h-6 text-primary" />
                  <span>JSON</span>
                  <span className="text-xs text-muted-foreground">Backup</span>
                </Button>
              </div>
              {filteredExpenses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  Nema transakcija u odabranom razdoblju
                </p>
              )}
            </div>
          </TabsContent>

          {/* Compare Tab */}
          <TabsContent value="compare" className="space-y-6">
            {/* Comparison Period Selection */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Vrsta usporedbe
              </Label>
              <Select value={comparePreset} onValueChange={(v) => setComparePreset(v as ComparePreset)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month-vs-month">Ovaj vs prošli mjesec</SelectItem>
                  <SelectItem value="year-vs-year">Ova vs prošla godina</SelectItem>
                  <SelectItem value="custom">Prilagođena usporedba</SelectItem>
                </SelectContent>
              </Select>

              {comparePreset === 'custom' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <Label className="text-xs font-medium text-primary mb-2 block">Razdoblje 1</Label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={customCompare1Start}
                        onChange={(e) => setCustomCompare1Start(e.target.value)}
                        className="rounded-lg text-sm"
                      />
                      <Input
                        type="date"
                        value={customCompare1End}
                        onChange={(e) => setCustomCompare1End(e.target.value)}
                        className="rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 border">
                    <Label className="text-xs font-medium text-muted-foreground mb-2 block">Razdoblje 2</Label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={customCompare2Start}
                        onChange={(e) => setCustomCompare2Start(e.target.value)}
                        className="rounded-lg text-sm"
                      />
                      <Input
                        type="date"
                        value={customCompare2End}
                        onChange={(e) => setCustomCompare2End(e.target.value)}
                        className="rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Comparison Summary */}
            <div className="grid grid-cols-2 gap-4">
              {/* Period 1 */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                <h3 className="font-semibold text-sm mb-3 text-primary">
                  {compareDateRanges.period1.label}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prihodi</span>
                    <span className="font-mono text-income">{formatCurrency(compareStats1.income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Troškovi</span>
                    <span className="font-mono text-expense">{formatCurrency(compareStats1.expenses)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-medium">Stanje</span>
                    <span className={cn("font-mono font-bold", compareStats1.balance >= 0 ? 'text-income' : 'text-expense')}>
                      {formatCurrency(compareStats1.balance)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    {compareStats1.transactionCount} transakcija
                  </p>
                </div>
              </div>

              {/* Period 2 */}
              <div className="p-4 rounded-xl bg-muted/50 border">
                <h3 className="font-semibold text-sm mb-3 text-muted-foreground">
                  {compareDateRanges.period2.label}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prihodi</span>
                    <span className="font-mono text-income">{formatCurrency(compareStats2.income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Troškovi</span>
                    <span className="font-mono text-expense">{formatCurrency(compareStats2.expenses)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-medium">Stanje</span>
                    <span className={cn("font-mono font-bold", compareStats2.balance >= 0 ? 'text-income' : 'text-expense')}>
                      {formatCurrency(compareStats2.balance)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    {compareStats2.transactionCount} transakcija
                  </p>
                </div>
              </div>
            </div>

            {/* Difference Summary */}
            <div className="p-4 rounded-xl border bg-card">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Razlika
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Prihodi</p>
                  <div className={cn("flex items-center gap-1 font-mono font-bold", getDiffColor(compareStats1.income - compareStats2.income))}>
                    {getDiffIcon(compareStats1.income - compareStats2.income)}
                    <span>{formatCurrency(Math.abs(compareStats1.income - compareStats2.income))}</span>
                  </div>
                  <p className={cn("text-xs", getDiffColor(compareStats1.income - compareStats2.income))}>
                    {formatPercent(compareStats2.income > 0 ? ((compareStats1.income - compareStats2.income) / compareStats2.income) * 100 : 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Troškovi</p>
                  <div className={cn("flex items-center gap-1 font-mono font-bold", getDiffColor(compareStats1.expenses - compareStats2.expenses, true))}>
                    {getDiffIcon(compareStats1.expenses - compareStats2.expenses)}
                    <span>{formatCurrency(Math.abs(compareStats1.expenses - compareStats2.expenses))}</span>
                  </div>
                  <p className={cn("text-xs", getDiffColor(compareStats1.expenses - compareStats2.expenses, true))}>
                    {formatPercent(compareStats2.expenses > 0 ? ((compareStats1.expenses - compareStats2.expenses) / compareStats2.expenses) * 100 : 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Stanje</p>
                  <div className={cn("flex items-center gap-1 font-mono font-bold", getDiffColor(compareStats1.balance - compareStats2.balance))}>
                    {getDiffIcon(compareStats1.balance - compareStats2.balance)}
                    <span>{formatCurrency(Math.abs(compareStats1.balance - compareStats2.balance))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Bar Chart */}
            {comparisonChartData.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Grafikon usporedbe
                </Label>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tickFormatter={(v) => `€${v}`} />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        width={70} 
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Bar 
                        dataKey={compareDateRanges.period1.label} 
                        fill="hsl(var(--primary))" 
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar 
                        dataKey={compareDateRanges.period2.label} 
                        fill="hsl(var(--muted-foreground))" 
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Category Comparison List */}
            {categoryComparison.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Detalji po kategorijama</Label>
                <div className="space-y-2">
                  {categoryComparison.map(({ category, amount1, amount2, diff, diffPercent }) => {
                    const info = getCategoryInfo(category as any);
                    return (
                      <div key={category} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                        <div className="w-8 text-center">{info.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{info.name}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>{compareDateRanges.period1.label}: {formatCurrency(amount1)}</span>
                            <span>{compareDateRanges.period2.label}: {formatCurrency(amount2)}</span>
                          </div>
                        </div>
                        <div className={cn("text-right", getDiffColor(diff, true))}>
                          <div className="flex items-center gap-1 font-mono text-sm font-bold">
                            {getDiffIcon(diff)}
                            <span>{formatCurrency(Math.abs(diff))}</span>
                          </div>
                          <p className="text-xs">{formatPercent(diffPercent)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(compareStats1.transactionCount === 0 && compareStats2.transactionCount === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nema transakcija za usporedbu u odabranim razdobljima
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
