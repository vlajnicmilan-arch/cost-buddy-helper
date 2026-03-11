import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, format, subMonths, subQuarters } from 'date-fns';

type VATRate = 25 | 13 | 5;
type VATMode = 'monthly' | 'quarterly';

const VAT_RATES: VATRate[] = [25, 13, 5];

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

      // Calculate VAT per rate
      const byRate: Record<number, { output: number; input: number }> = {};
      VAT_RATES.forEach(rate => { byRate[rate] = { output: 0, input: 0 }; });

      let totalOutputVAT = 0;
      let totalInputVAT = 0;

      periodExpenses.forEach(e => {
        const expAny = e as any;
        const vatRate = expAny.vat_rate as number | null;
        const vatAmount = expAny.vat_amount as number | null;

        if (vatRate && vatAmount) {
          // Use explicit VAT data
          if (e.type === 'income') {
            totalOutputVAT += vatAmount;
            if (byRate[vatRate]) byRate[vatRate].output += vatAmount;
          } else if (e.type === 'expense') {
            totalInputVAT += vatAmount;
            if (byRate[vatRate]) byRate[vatRate].input += vatAmount;
          }
        } else {
          // Fallback: estimate at 25%
          if (e.type === 'income') {
            const vat = e.amount * 0.25 / 1.25;
            totalOutputVAT += vat;
            byRate[25].output += vat;
          } else if (e.type === 'expense') {
            const vat = e.amount * 0.25 / 1.25;
            totalInputVAT += vat;
            byRate[25].input += vat;
          }
        }
      });

      const netVAT = totalOutputVAT - totalInputVAT;
      return { label, totalOutputVAT, totalInputVAT, netVAT, byRate };
    });
  }, [expenses, mode]);

  const current = data[data.length - 1];
  const hasExplicitVAT = expenses.some(e => (e as any).vat_rate != null);

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

      {/* Current Period Summary */}
      {current && (
        <Card className="border-none shadow-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-semibold">{current.label}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Izlazni PDV</p>
                <p className="text-sm font-bold text-foreground">{formatAmount(current.totalOutputVAT)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Ulazni PDV</p>
                <p className="text-sm font-bold text-foreground">{formatAmount(current.totalInputVAT)}</p>
              </div>
              <div className={`p-2 rounded-lg ${current.netVAT >= 0 ? 'bg-expense/5' : 'bg-income/5'}`}>
                <p className="text-[10px] text-muted-foreground">{current.netVAT >= 0 ? 'Za uplatu' : 'Povrat'}</p>
                <p className={`text-sm font-bold ${current.netVAT >= 0 ? 'text-expense' : 'text-income'}`}>
                  {formatAmount(Math.abs(current.netVAT))}
                </p>
              </div>
            </div>

            {/* Breakdown by rate */}
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Po stopama</p>
              {VAT_RATES.map(rate => {
                const r = current.byRate[rate];
                if (!r || (r.output === 0 && r.input === 0)) return null;
                return (
                  <div key={rate} className="grid grid-cols-4 text-xs py-1 border-b border-border/20">
                    <span className="font-medium">{rate}%</span>
                    <span className="text-right text-muted-foreground">{formatAmount(r.output)}</span>
                    <span className="text-right text-muted-foreground">{formatAmount(r.input)}</span>
                    <span className={`text-right font-medium ${(r.output - r.input) >= 0 ? 'text-expense' : 'text-income'}`}>
                      {formatAmount(Math.abs(r.output - r.input))}
                    </span>
                  </div>
                );
              })}
            </div>

            {!hasExplicitVAT && (
              <p className="text-[10px] text-muted-foreground text-center">
                * Procjena na temelju stope od 25%. Dodajte PDV stopu na transakcije za točniji izračun.
              </p>
            )}
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
                <span className="text-right">{formatAmount(d.totalOutputVAT)}</span>
                <span className="text-right">{formatAmount(d.totalInputVAT)}</span>
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
