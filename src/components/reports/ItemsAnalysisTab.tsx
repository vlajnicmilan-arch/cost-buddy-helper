import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, getCategoryInfo, CATEGORIES } from '@/types/expense';
import { ReceiptItem } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { getLocalReceiptItems } from '@/lib/storage/indexedDB';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Download, FileText, FileSpreadsheet, FileJson, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { PieChart as PieChartIcon, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ItemWithCategory extends ReceiptItem {
  category: string;
  categoryName: string;
  categoryIcon: string;
  expenseDate: Date;
  expenseDescription: string;
}

interface CategoryItemGroup {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  color: string;
  totalAmount: number;
  itemCount: number;
  items: ItemWithCategory[];
}

const CATEGORY_COLORS: Record<string, string> = {
  food: '#f97316', groceries: '#fb923c', transport: '#3b82f6', car: '#60a5fa',
  shopping: '#ec4899', clothing: '#f472b6', entertainment: '#a855f7', subscriptions: '#c084fc',
  bills: '#6366f1', utilities: '#818cf8', rent: '#4f46e5', health: '#22c55e',
  beauty: '#4ade80', sports: '#86efac', education: '#14b8a6', travel: '#f59e0b',
  home: '#8b5cf6', pets: '#eab308', gifts: '#ef4444', kids: '#06b6d4',
  insurance: '#0ea5e9', taxes: '#64748b', savings: '#10b981', investments: '#059669',
  charity: '#dc2626', other: '#6b7280',
};

interface ItemsAnalysisTabProps {
  filteredExpenses: Expense[];
  dateRange: { start: Date; end: Date };
}

export const ItemsAnalysisTab = ({ filteredExpenses, dateRange }: ItemsAnalysisTabProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const isLocalMode = storageMode === 'local' && !user;

  const [allItems, setAllItems] = useState<ItemWithCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Fetch receipt items for all filtered expense-type transactions
  useEffect(() => {
    const fetchItems = async () => {
      const expenseOnly = filteredExpenses.filter(e => e.type === 'expense');
      if (expenseOnly.length === 0) {
        setAllItems([]);
        return;
      }

      setLoading(true);
      try {
        const expenseIds = expenseOnly.map(e => e.id);
        const expenseMap = new Map(expenseOnly.map(e => [e.id, e]));

        let rawItems: ReceiptItem[] = [];

        if (isLocalMode) {
          for (const id of expenseIds) {
            const items = await getLocalReceiptItems(id);
            rawItems.push(...items);
          }
        } else {
          // Fetch in batches of 100 to avoid query limits
          for (let i = 0; i < expenseIds.length; i += 100) {
            const batch = expenseIds.slice(i, i + 100);
            const { data, error } = await supabase
              .from('receipt_items')
              .select('*')
              .in('expense_id', batch);
            if (!error && data) {
              rawItems.push(...(data as ReceiptItem[]));
            }
          }
        }

        const itemsWithCategory: ItemWithCategory[] = rawItems
          .filter(item => item.expense_id && expenseMap.has(item.expense_id))
          .map(item => {
            const expense = expenseMap.get(item.expense_id!)!;
            const catInfo = getCategoryInfo(expense.category as any);
            return {
              ...item,
              category: expense.category,
              categoryName: catInfo.name,
              categoryIcon: 'icon' in catInfo ? catInfo.icon : '📦',
              expenseDate: expense.date,
              expenseDescription: expense.description,
            };
          });

        setAllItems(itemsWithCategory);
      } catch (err) {
        console.error('Error fetching items:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [filteredExpenses, isLocalMode]);

  // Group items by category
  const categoryGroups = useMemo((): CategoryItemGroup[] => {
    const groups: Record<string, CategoryItemGroup> = {};

    allItems.forEach(item => {
      if (!groups[item.category]) {
        groups[item.category] = {
          categoryId: item.category,
          categoryName: item.categoryName,
          categoryIcon: item.categoryIcon,
          color: CATEGORY_COLORS[item.category] || '#6b7280',
          totalAmount: 0,
          itemCount: 0,
          items: [],
        };
      }
      groups[item.category].totalAmount += item.total_price;
      groups[item.category].itemCount += 1;
      groups[item.category].items.push(item);
    });

    return Object.values(groups).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [allItems]);

  const totalItemsAmount = useMemo(() => categoryGroups.reduce((s, g) => s + g.totalAmount, 0), [categoryGroups]);

  const chartData = useMemo(() => {
    return categoryGroups.slice(0, 8).map(g => ({
      name: g.categoryName,
      value: g.totalAmount,
      icon: g.categoryIcon,
      color: g.color,
    }));
  }, [categoryGroups]);

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFont('helvetica');
      doc.setFontSize(16);
      doc.text('Analiza troskova po artiklima', 14, 20);
      doc.setFontSize(10);
      doc.text(`Razdoblje: ${dateRange.start.toLocaleDateString('hr-HR')} - ${dateRange.end.toLocaleDateString('hr-HR')}`, 14, 28);
      doc.text(`Ukupno artikala: ${allItems.length} | Ukupni iznos: ${formatAmount(totalItemsAmount)}`, 14, 34);

      const tableData = categoryGroups.flatMap(group =>
        group.items.map(item => [
          group.categoryName,
          item.name,
          item.quantity?.toString() || '1',
          item.unit_price ? formatAmount(item.unit_price) : '-',
          formatAmount(item.total_price),
        ])
      );

      autoTable(doc, {
        startY: 40,
        head: [['Kategorija', 'Artikl', 'Kol.', 'Jed. cijena', 'Ukupno']],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246] },
      });

      doc.save(`artikli-analiza-${dateRange.start.toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF izvjesce generirano!');
    } catch {
      toast.error('Greska pri generiranju PDF-a');
    }
  };

  const handleExportCSV = () => {
    try {
      const header = 'Kategorija,Artikl,Kolicina,Jedinicna cijena,Ukupno,Datum,Opis transakcije\n';
      const rows = allItems.map(item =>
        `"${item.categoryName}","${item.name}",${item.quantity || 1},${item.unit_price || ''},${item.total_price},"${item.expenseDate.toLocaleDateString('hr-HR')}","${item.expenseDescription}"`
      ).join('\n');
      const bom = '\uFEFF';
      const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `artikli-analiza-${dateRange.start.toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV datoteka generirana!');
    } catch {
      toast.error('Greska pri generiranju CSV-a');
    }
  };

  const handleExportJSON = () => {
    try {
      const data = {
        period: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        },
        summary: {
          totalItems: allItems.length,
          totalAmount: totalItemsAmount,
          categoriesCount: categoryGroups.length,
        },
        categories: categoryGroups.map(g => ({
          category: g.categoryName,
          totalAmount: g.totalAmount,
          itemCount: g.itemCount,
          items: g.items.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unit_price,
            totalPrice: i.total_price,
            date: i.expenseDate.toISOString(),
          })),
        })),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `artikli-analiza-${dateRange.start.toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('JSON datoteka generirana!');
    } catch {
      toast.error('Greska pri generiranju JSON-a');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Učitavanje artikala...</span>
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <ShoppingBag className="w-10 h-10 mx-auto text-muted-foreground/50" />
        <p className="text-muted-foreground">Nema artikala u odabranom razdoblju</p>
        <p className="text-xs text-muted-foreground/70">Artikli se dodaju automatski prilikom skeniranja računa</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-muted/50 border">
          <span className="text-xs text-muted-foreground">Ukupno artikala</span>
          <p className="font-mono font-bold">{allItems.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-muted/50 border">
          <span className="text-xs text-muted-foreground">Ukupni iznos</span>
          <p className="font-mono font-bold text-expense">{formatAmount(totalItemsAmount)}</p>
        </div>
        <div className="p-4 rounded-xl bg-muted/50 border">
          <span className="text-xs text-muted-foreground">Kategorija</span>
          <p className="font-mono font-bold">{categoryGroups.length}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Artikli po kategorijama
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
                    formatter={(value: number) => formatAmount(value)}
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
                  <XAxis type="number" tickFormatter={(v) => formatAmount(v)} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => formatAmount(value)}
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
        </div>
      )}

      {/* Category groups with expandable item lists */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Detalji po kategorijama</Label>
        {categoryGroups.map(group => {
          const isExpanded = expandedCategory === group.categoryId;
          const percentage = totalItemsAmount > 0 ? (group.totalAmount / totalItemsAmount) * 100 : 0;

          return (
            <div key={group.categoryId} className="rounded-xl border overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedCategory(isExpanded ? null : group.categoryId)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{group.categoryIcon}</span>
                  <div className="text-left">
                    <span className="font-medium text-sm">{group.categoryName}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({group.itemCount} {group.itemCount === 1 ? 'artikl' : 'artikala'})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-mono text-sm font-semibold">{formatAmount(group.totalAmount)}</span>
                    <span className="text-xs text-muted-foreground ml-1">({percentage.toFixed(1)}%)</span>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t bg-muted/30">
                  <div className="divide-y">
                    {group.items
                      .sort((a, b) => b.total_price - a.total_price)
                      .map((item, idx) => (
                        <div key={item.id || idx} className="flex items-center justify-between px-4 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium truncate block">{item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.expenseDate.toLocaleDateString('hr-HR')}
                              {item.quantity && item.quantity > 1 && ` · ${item.quantity}x`}
                              {item.unit_price ? ` · ${formatAmount(item.unit_price)}/kom` : ''}
                            </span>
                          </div>
                          <span className="font-mono text-sm font-medium shrink-0 ml-2">
                            {formatAmount(item.total_price)}
                          </span>
                        </div>
                      ))}
                  </div>
                  {/* Category sum */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/60 font-semibold text-sm">
                    <span>Ukupno {group.categoryName}</span>
                    <span className="font-mono">{formatAmount(group.totalAmount)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Export */}
      <div className="space-y-3 pt-4 border-t">
        <Label className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Izvezi analizu artikala
        </Label>
        <div className="grid grid-cols-3 gap-3">
          <Button variant="outline" className="gap-2 rounded-xl h-auto py-4 flex-col" onClick={handleExportPDF}>
            <FileText className="w-6 h-6 text-destructive" />
            <span>PDF</span>
          </Button>
          <Button variant="outline" className="gap-2 rounded-xl h-auto py-4 flex-col" onClick={handleExportCSV}>
            <FileSpreadsheet className="w-6 h-6 text-income" />
            <span>CSV</span>
          </Button>
          <Button variant="outline" className="gap-2 rounded-xl h-auto py-4 flex-col" onClick={handleExportJSON}>
            <FileJson className="w-6 h-6 text-primary" />
            <span>JSON</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
