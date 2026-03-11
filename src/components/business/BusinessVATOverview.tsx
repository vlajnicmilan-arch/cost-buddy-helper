import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, format, subMonths, subQuarters } from 'date-fns';

type VATRate = 25 | 13 | 5;
type VATMode = 'monthly' | 'quarterly';

interface Props {
  expenses: Expense[];
}

export const BusinessVATOverview = ({ expenses }: Props) => {
  const { formatAmount } = useCurrency();
  const [mode, setMode] = useState<VATMode>('monthly');
  const now = new Date();

  const data = useMemo(() => {
    const count = mode === 'monthly' ? 6 : 4;
    return Array.from({ length: count }, (_, i) => {
      const offset = count - 1 - i;
      const d = mode === 'monthly' ? subMonths(now, offset) : subQuarters(now, offset);
      const start = mode === 'monthly' ? startOfMonth(d) : startOfQuarter(d);
      const end = mode === 'monthly' ? endOfMonth(d) : endOfQuarter(d);
      const label = mode === 'monthly' ? format(d, 'MMM yyyy') : `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;

      const periodExpenses = expenses.filter(e => e.date >= start && e.date <= end);
      const totalIncome = periodExpenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const totalExpense = periodExpenses.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

      // Estimate VAT at 25% (default Croatian rate)
      const outputVAT = totalIncome * 0.25 / 1.25; // VAT in income (output)
      const inputVAT = totalExpense * 0.25 / 1.25; // VAT in expenses (input)
      const netVAT = outputVAT - inputVAT; // Positive = you owe, Negative = refund

      return { label, totalIncome, totalExpense, outputVAT, inputVAT, netVAT };
    });
  }, [expenses, mode]);

  const current = data[data.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {([
          { value: 'monthly' as VATMode, label: 'Mjesečno' },
          { value: 'quarterly' as VATMode, label: 'Kvartalno' },
        ]).map(m => (
          <Badge
            key={m.value}
            variant={mode === m.value ? 'default' : 'outline'}
            className="cursor-pointer text-[10px] px-2 py-0.5"
            onClick={() => setMode(m.value)}
          >
            {m.label}
          </Badge>
        ))}
      </div>

      {/* Current Period */}
      {current && (
        <Card className="border-none shadow-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-semibold">{current.label}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Izlazni PDV</p>
                <p className="text-sm font-bold text-foreground">{formatAmount(current.outputVAT)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Ulazni PDV</p>
                <p className="text-sm font-bold text-foreground">{formatAmount(current.inputVAT)}</p>
              </div>
              <div className={`p-2 rounded-lg ${current.netVAT >= 0 ? 'bg-expense/5' : 'bg-income/5'}`}>
                <p className="text-[10px] text-muted-foreground">{current.netVAT >= 0 ? 'Za uplatu' : 'Povrat'}</p>
                <p className={`text-sm font-bold ${current.netVAT >= 0 ? 'text-expense' : 'text-income'}`}>
                  {formatAmount(Math.abs(current.netVAT))}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              * Procjena na temelju stope od 25%. Za točan izračun konzultirajte knjigovođu.
            </p>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm font-semibold">Pregled po periodima</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="space-y-1">
            <div className="grid grid-cols-4 text-[10px] text-muted-foreground pb-1 border-b border-border/30">
              <span>Period</span>
              <span className="text-right">Izlazni</span>
              <span className="text-right">Ulazni</span>
              <span className="text-right">Neto</span>
            </div>
            {data.map(d => (
              <div key={d.label} className="grid grid-cols-4 text-xs py-1 border-b border-border/20 last:border-0">
                <span className="text-muted-foreground">{d.label}</span>
                <span className="text-right">{formatAmount(d.outputVAT)}</span>
                <span className="text-right">{formatAmount(d.inputVAT)}</span>
                <span className={`text-right font-medium ${d.netVAT >= 0 ? 'text-expense' : 'text-income'}`}>
                  {d.netVAT >= 0 ? '' : '-'}{formatAmount(Math.abs(d.netVAT))}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
