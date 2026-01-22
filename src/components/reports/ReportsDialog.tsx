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
import { Expense, getCategoryInfo, CATEGORIES } from '@/types/expense';
import { IncomeSource } from '@/types/incomeSource';
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
  PieChart,
} from 'lucide-react';
import { generatePDFReport, generateCSVReport, generateJSONExport, ReportData } from '@/lib/reportExport';
import { toast } from 'sonner';

interface ReportsDialogProps {
  expenses: Expense[];
}

type PeriodPreset = 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'all' | 'custom';

export const ReportsDialog = ({ expenses }: ReportsDialogProps) => {
  const { incomeSources } = useIncomeSources();
  const [open, setOpen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

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

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const expenseDate = e.date.getTime();
      return expenseDate >= dateRange.start.getTime() && expenseDate <= dateRange.end.getTime() + 86400000;
    });
  }, [expenses, dateRange]);

  const stats = useMemo(() => {
    const income = filteredExpenses
      .filter(e => e.type === 'income')
      .reduce((sum, e) => sum + e.amount, 0);
    const expenseTotal = filteredExpenses
      .filter(e => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);
    const transfers = filteredExpenses
      .filter(e => e.type === 'transfer')
      .reduce((sum, e) => sum + e.amount, 0);

    const byCategory: Record<string, number> = {};
    filteredExpenses
      .filter(e => e.type === 'expense')
      .forEach(e => {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      });

    const byPaymentSource: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const source = e.payment_source || 'cash';
      byPaymentSource[source] = (byPaymentSource[source] || 0) + e.amount;
    });

    const byIncomeSource: Record<string, { income: number; expenses: number; balance: number }> = {};
    filteredExpenses
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
      transactionCount: filteredExpenses.length,
    };
  }, [filteredExpenses]);

  const topCategories = useMemo(() => {
    return Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [stats.byCategory]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(amount);

  const getReportData = (): ReportData => ({
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
  });

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
        <Button variant="outline" className="gap-2 rounded-xl">
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

        <div className="space-y-6 py-4">
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

            <p className="text-sm text-muted-foreground">
              {dateRange.start.toLocaleDateString('hr-HR')} - {dateRange.end.toLocaleDateString('hr-HR')}
              <span className="ml-2">({stats.transactionCount} transakcija)</span>
            </p>
          </div>

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
              <p className={`font-mono font-bold ${stats.balance >= 0 ? 'text-income' : 'text-expense'}`}>
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

          {/* Top Categories */}
          {topCategories.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Top 5 kategorija troškova</Label>
              <div className="space-y-2">
                {topCategories.map(([categoryId, amount]) => {
                  const info = getCategoryInfo(categoryId as any);
                  const percentage = stats.expenses > 0 ? (amount / stats.expenses) * 100 : 0;
                  return (
                    <div key={categoryId} className="flex items-center gap-3">
                      <div className="w-8 text-center">{info.icon}</div>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>{info.name}</span>
                          <span className="font-mono">{formatCurrency(amount)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-expense rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
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
                <FileText className="w-6 h-6 text-red-500" />
                <span>PDF</span>
                <span className="text-xs text-muted-foreground">Izvješće</span>
              </Button>
              <Button
                variant="outline"
                className="gap-2 rounded-xl h-auto py-4 flex-col"
                onClick={handleExportCSV}
                disabled={filteredExpenses.length === 0}
              >
                <FileSpreadsheet className="w-6 h-6 text-green-500" />
                <span>CSV</span>
                <span className="text-xs text-muted-foreground">Excel/Sheets</span>
              </Button>
              <Button
                variant="outline"
                className="gap-2 rounded-xl h-auto py-4 flex-col"
                onClick={handleExportJSON}
                disabled={filteredExpenses.length === 0}
              >
                <FileJson className="w-6 h-6 text-blue-500" />
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
