import { useState, useMemo } from 'react';
import { Download, FileSpreadsheet, Calendar, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { toast } from 'sonner';

export const SynesisExportPanel = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { allExpenses } = useExpenses();
  const { currency } = useCurrency();

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
  const [includeVAT, setIncludeVAT] = useState(true);
  const [splitByType, setSplitByType] = useState(false);

  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(e => {
      if (!e.business_profile_id || e.business_profile_id !== activeBusinessProfileId) return false;
      const d = e.date instanceof Date ? e.date : new Date(e.date);
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59);
      return d >= from && d <= to;
    });
  }, [allExpenses, activeBusinessProfileId, dateFrom, dateTo]);

  const incomeCount = filteredExpenses.filter(e => e.type === 'income').length;
  const expenseCount = filteredExpenses.filter(e => e.type === 'expense').length;

  const generateCSV = (type?: 'income' | 'expense') => {
    let data = filteredExpenses;
    if (type) data = data.filter(e => e.type === type);

    if (data.length === 0) {
      toast.error('Nema transakcija za izvoz u odabranom razdoblju');
      return;
    }

    // Sort by date
    data.sort((a, b) => {
      const da = a.date instanceof Date ? a.date : new Date(a.date);
      const db = b.date instanceof Date ? b.date : new Date(b.date);
      return da.getTime() - db.getTime();
    });

    // Build CSV header
    const headers = [
      'R.br.',
      'Datum',
      'Tip',
      'Kategorija',
      'Opis',
      'Partner',
      'Iznos',
      ...(includeVAT ? ['PDV stopa (%)', 'PDV iznos', 'Osnovica'] : []),
      'Izvor plaćanja',
      'Valuta',
    ];

    const rows = data.map((e, i) => {
      const d = e.date instanceof Date ? e.date : new Date(e.date);
      const vatRate = (e as any).vat_rate || 0;
      const vatAmount = (e as any).vat_amount || 0;
      const base = vatAmount > 0 ? e.amount - vatAmount : e.amount;

      return [
        (i + 1).toString(),
        format(d, 'dd.MM.yyyy'),
        e.type === 'income' ? 'Prihod' : 'Rashod',
        e.category || '',
        `"${(e.description || '').replace(/"/g, '""')}"`,
        `"${(e.merchant_name || '').replace(/"/g, '""')}"`,
        e.amount.toFixed(2).replace('.', ','),
        ...(includeVAT ? [
          vatRate.toString().replace('.', ','),
          vatAmount.toFixed(2).replace('.', ','),
          base.toFixed(2).replace('.', ','),
        ] : []),
        `"${(e.payment_source || '').replace(/"/g, '""')}"`,
        e.currency || currency,
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const suffix = type ? (type === 'income' ? '_IRA' : '_URA') : '_SVE';
    a.href = url;
    a.download = `Synesis_export${suffix}_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Izvezeno ${data.length} transakcija`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <FileSpreadsheet className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold">Izvoz za Synesis</h2>
      </div>

      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Izvezi poslovne transakcije u CSV formatu prilagođenom za uvoz u Synesis. 
              Datoteka koristi <strong>točku-zarez (;)</strong> kao separator i <strong>zarez</strong> za decimale — 
              standardni format za hrvatske programe.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Date range */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="w-4 h-4 text-primary" />
            Razdoblje
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Od</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Do</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">Pronađeno transakcija:</span>
            <div className="flex gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {incomeCount} prihoda
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {expenseCount} rashoda
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Uključi PDV stupce</p>
              <p className="text-[10px] text-muted-foreground">Stopa, iznos PDV-a i osnovica</p>
            </div>
            <Switch checked={includeVAT} onCheckedChange={setIncludeVAT} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Podijeli u 2 datoteke</p>
              <p className="text-[10px] text-muted-foreground">Odvojeno URA (rashodi) i IRA (prihodi)</p>
            </div>
            <Switch checked={splitByType} onCheckedChange={setSplitByType} />
          </div>
        </CardContent>
      </Card>

      {/* Export buttons */}
      <div className="space-y-2">
        {splitByType ? (
          <>
            <Button
              className="w-full gap-2"
              onClick={() => generateCSV('expense')}
              disabled={expenseCount === 0}
            >
              <Download className="w-4 h-4" />
              Izvezi URA (rashodi) — {expenseCount}
            </Button>
            <Button
              className="w-full gap-2"
              variant="secondary"
              onClick={() => generateCSV('income')}
              disabled={incomeCount === 0}
            >
              <Download className="w-4 h-4" />
              Izvezi IRA (prihodi) — {incomeCount}
            </Button>
          </>
        ) : (
          <Button
            className="w-full gap-2"
            onClick={() => generateCSV()}
            disabled={filteredExpenses.length === 0}
          >
            <Download className="w-4 h-4" />
            Izvezi CSV za Synesis — {filteredExpenses.length} transakcija
          </Button>
        )}
      </div>
    </div>
  );
};
