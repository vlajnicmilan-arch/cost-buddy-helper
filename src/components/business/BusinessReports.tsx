import { useState, useMemo } from 'react';
import { Download, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subQuarters, subYears, format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useTranslation } from 'react-i18next';

type Period = 'monthly' | 'quarterly' | 'yearly';

interface Props {
  expenses: Expense[];
  companyName: string;
}

export const BusinessReports = ({ expenses, companyName }: Props) => {
  const { formatAmount, currency } = useCurrency();
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('monthly');
  const now = new Date();

  const periodData = useMemo(() => {
    const getPeriodRange = (p: Period, offset: number) => {
      if (p === 'monthly') {
        const d = subMonths(now, offset);
        return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, 'MMM yyyy') };
      }
      if (p === 'quarterly') {
        const d = subQuarters(now, offset);
        return { start: startOfQuarter(d), end: endOfQuarter(d), label: `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}` };
      }
      const d = subYears(now, offset);
      return { start: startOfYear(d), end: endOfYear(d), label: d.getFullYear().toString() };
    };

    const count = period === 'monthly' ? 6 : period === 'quarterly' ? 4 : 3;
    return Array.from({ length: count }, (_, i) => {
      const { start, end, label } = getPeriodRange(period, count - 1 - i);
      const periodExpenses = expenses.filter(e => e.date >= start && e.date <= end);
      const income = periodExpenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const expense = periodExpenses.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
      return { label, income, expense, profit: income - expense, count: periodExpenses.length };
    });
  }, [expenses, period]);

  const current = periodData[periodData.length - 1];
  const previous = periodData.length > 1 ? periodData[periodData.length - 2] : null;

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${companyName} — ${t('business.reports.businessReport', 'Poslovni izvještaj')}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`${t('business.reports.generated', 'Generirano')}: ${format(now, 'dd.MM.yyyy HH:mm')}`, 14, 28);
    doc.text(`${t('business.reports.period', 'Period')}: ${period === 'monthly' ? t('business.reports.monthly', 'Mjesečno') : period === 'quarterly' ? t('business.reports.quarterly', 'Kvartalno') : t('business.reports.yearly', 'Godišnje')}`, 14, 34);

    autoTable(doc, {
      startY: 42,
      head: [[t('business.reports.period', 'Period'), `${t('business.reports.income', 'Prihodi')} (${currency})`, `${t('business.reports.expenses', 'Rashodi')} (${currency})`, `${t('business.reports.profit', 'Dobit')} (${currency})`, t('business.reports.transactionCount', 'Br. transakcija')]],
      body: periodData.map(p => [
        p.label,
        p.income.toFixed(2),
        p.expense.toFixed(2),
        p.profit.toFixed(2),
        p.count.toString(),
      ]),
    });

    doc.save(`${companyName.replace(/\s+/g, '_')}_report_${format(now, 'yyyyMMdd')}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {([
            { value: 'monthly' as Period, label: t('business.reports.monthly', 'Mjesečno') },
            { value: 'quarterly' as Period, label: t('business.reports.quarterly', 'Kvartalno') },
            { value: 'yearly' as Period, label: t('business.reports.yearly', 'Godišnje') },
          ]).map(p => (
            <Badge
              key={p.value}
              variant={period === p.value ? 'default' : 'outline'}
              className="cursor-pointer text-[10px] px-2 py-0.5"
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Badge>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={exportPDF}>
          <Download className="w-3 h-3" />
          PDF
        </Button>
      </div>

      {current && (
        <Card className="border-none shadow-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {current.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground">{t('business.reports.income', 'Prihodi')}</p>
                <p className="text-sm font-bold text-income">{formatAmount(current.income)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{t('business.reports.expenses', 'Rashodi')}</p>
                <p className="text-sm font-bold text-expense">{formatAmount(current.expense)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{t('business.reports.profit', 'Dobit')}</p>
                <p className={`text-sm font-bold ${current.profit >= 0 ? 'text-income' : 'text-expense'}`}>
                  {formatAmount(current.profit)}
                </p>
              </div>
            </div>
            {previous && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground text-center">
                  vs {previous.label}: {t('business.reports.profit', 'dobit')} {previous.profit >= 0 ? '+' : ''}{formatAmount(previous.profit)}
                  {current.profit !== 0 && previous.profit !== 0 && (
                    <span className={current.profit > previous.profit ? ' text-income' : ' text-expense'}>
                      {' '}({((current.profit - previous.profit) / Math.abs(previous.profit) * 100).toFixed(0)}%)
                    </span>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {periodData.some(p => p.income > 0 || p.expense > 0) && (
        <Card className="border-none shadow-sm">
          <CardContent className="p-3">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periodData} barGap={2}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(val: number) => formatAmount(val)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar name={t('business.reports.income', 'Prihodi')} dataKey="income" fill="hsl(160,75%,42%)" radius={[4, 4, 0, 0]} />
                  <Bar name={t('business.reports.expenses', 'Rashodi')} dataKey="expense" fill="hsl(0,72%,55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm font-semibold">{t('business.reports.summaryByPeriods', 'Sažetak po periodima')}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="space-y-1.5">
            {periodData.map(p => (
              <div key={p.label} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                <span className="text-muted-foreground">{p.label}</span>
                <div className="flex gap-3">
                  <span className="text-income">{formatAmount(p.income)}</span>
                  <span className="text-expense">{formatAmount(p.expense)}</span>
                  <span className={`font-medium ${p.profit >= 0 ? 'text-income' : 'text-expense'}`}>
                    {p.profit >= 0 ? '+' : ''}{formatAmount(p.profit)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
