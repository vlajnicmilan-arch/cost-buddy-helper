import { useState, useMemo, useEffect } from 'react';
import { Download, FileSpreadsheet, Calendar, Info, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORIES, INCOME_CATEGORIES } from '@/types/expense';
import { resolveKonto, DEFAULT_EXPENSE_KONTO, DEFAULT_INCOME_KONTO } from '@/lib/kontoMapping';
import { resolveCategory } from '@/hooks/useResolvedCategory';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';

export const SynesisExportPanel = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { allExpenses } = useExpenses();
  const { currency } = useCurrency();
  const { customCategories } = useCustomCategories();

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
  const [includeVAT, setIncludeVAT] = useState(true);
  const [includeKonto, setIncludeKonto] = useState(true);
  const [splitByType, setSplitByType] = useState(false);
  const [kontoOpen, setKontoOpen] = useState(false);
  const [kontoOverrides, setKontoOverrides] = useState<Record<string, string>>({});
  const [clientsMap, setClientsMap] = useState<Record<string, { oib: string; name: string }>>({});

  // Fetch clients for OIB lookup
  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    supabase
      .from('clients')
      .select('name, oib')
      .eq('business_profile_id', activeBusinessProfileId)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, { oib: string; name: string }> = {};
          data.forEach(c => {
            if (c.name) {
              map[c.name.toLowerCase().trim()] = { oib: c.oib || '', name: c.name };
            }
          });
          setClientsMap(map);
        }
      });
  }, [activeBusinessProfileId, user]);

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

  // Get used categories for konto mapping display
  const usedCategories = useMemo(() => {
    const catSet = new Set<string>();
    filteredExpenses.forEach(e => catSet.add(e.category));
    return Array.from(catSet);
  }, [filteredExpenses]);

  const lookupPartnerOIB = (merchantName: string | null | undefined): string => {
    if (!merchantName) return '';
    const key = merchantName.toLowerCase().trim();
    return clientsMap[key]?.oib || '';
  };

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
      'Knjiga',
      'Broj dokumenta',
      'Datum',
      ...(includeKonto ? ['Konto'] : []),
      'Kategorija',
      'Opis',
      'Partner',
      'OIB partnera',
      'Iznos',
      ...(includeVAT ? ['PDV stopa (%)', 'PDV iznos', 'Osnovica'] : []),
      'Izvor plaćanja',
      'Valuta',
    ];

    // Track document numbers per book type
    let uraNum = 0;
    let iraNum = 0;

    const rows = data.map((e, i) => {
      const d = e.date instanceof Date ? e.date : new Date(e.date);
      const vatRate = (e as any).vat_rate || 0;
      const vatAmount = (e as any).vat_amount || 0;
      const base = vatAmount > 0 ? e.amount - vatAmount : e.amount;
      const isIncome = e.type === 'income';
      const bookType = isIncome ? 'IRA' : 'URA';

      // Document number
      if (isIncome) iraNum++;
      else uraNum++;
      const docNum = isIncome ? `IRA-${iraNum}` : `URA-${uraNum}`;

      // Resolve konto
      const kontoInfo = resolveKonto(e.category, e.type, kontoOverrides);

      // Resolve category name
      const resolved = resolveCategory(e.category, customCategories);
      const categoryName = resolved.name;

      // Partner OIB
      const partnerOIB = lookupPartnerOIB(e.merchant_name);

      // Payment source display
      let paymentSourceDisplay = e.payment_source || '';
      if (paymentSourceDisplay === 'cash') paymentSourceDisplay = 'Gotovina';
      else if (paymentSourceDisplay === 'bank') paymentSourceDisplay = 'Žiro-račun';
      else if (paymentSourceDisplay?.startsWith('custom:')) paymentSourceDisplay = 'Račun';

      return [
        (i + 1).toString(),
        bookType,
        docNum,
        format(d, 'dd.MM.yyyy'),
        ...(includeKonto ? [kontoInfo.konto] : []),
        `"${categoryName.replace(/"/g, '""')}"`,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        `"${(e.merchant_name || '').replace(/"/g, '""')}"`,
        partnerOIB,
        e.amount.toFixed(2).replace('.', ','),
        ...(includeVAT ? [
          vatRate.toString().replace('.', ','),
          vatAmount.toFixed(2).replace('.', ','),
          base.toFixed(2).replace('.', ','),
        ] : []),
        `"${paymentSourceDisplay.replace(/"/g, '""')}"`,
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
              Uključuje <strong>kontni plan</strong>, <strong>knjižnu oznaku</strong> (URA/IRA),
              <strong> broj dokumenta</strong> i <strong>OIB partnera</strong> ako je pohranjen.
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
              <p className="text-sm font-medium">Uključi konto</p>
              <p className="text-[10px] text-muted-foreground">Mapiranje kategorija na kontni plan</p>
            </div>
            <Switch checked={includeKonto} onCheckedChange={setIncludeKonto} />
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

      {/* Konto mapping */}
      {includeKonto && usedCategories.length > 0 && (
        <Collapsible open={kontoOpen} onOpenChange={setKontoOpen}>
          <Card>
            <CardContent className="p-3">
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Mapiranje kategorija → konto</span>
                </div>
                {kontoOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-2">
                <p className="text-[10px] text-muted-foreground mb-2">
                  Prilagodi konto brojeve za svoje kategorije. Promjene vrijede samo za ovaj izvoz.
                </p>
                {usedCategories.map(catId => {
                  const resolved = resolveCategory(catId, customCategories);
                  // Determine if this category appears in income or expense context
                  const hasIncome = filteredExpenses.some(e => e.category === catId && e.type === 'income');
                  const hasExpense = filteredExpenses.some(e => e.category === catId && e.type !== 'income');
                  const defaultKonto = hasExpense
                    ? (DEFAULT_EXPENSE_KONTO[catId]?.konto || '4699')
                    : (DEFAULT_INCOME_KONTO[catId]?.konto || '7690');
                  const currentKonto = kontoOverrides[catId] || defaultKonto;

                  return (
                    <div key={catId} className="flex items-center gap-2">
                      <span className="text-sm flex-1 min-w-0 truncate">
                        {resolved.icon} {resolved.name}
                      </span>
                      <Input
                        value={currentKonto}
                        onChange={e => setKontoOverrides(prev => ({ ...prev, [catId]: e.target.value }))}
                        className="w-20 h-7 text-xs text-center font-mono"
                        maxLength={6}
                      />
                    </div>
                  );
                })}
              </CollapsibleContent>
            </CardContent>
          </Card>
        </Collapsible>
      )}

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
