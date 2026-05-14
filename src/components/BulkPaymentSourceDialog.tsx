import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Expense, PaymentSource, getPaymentSourceInfo } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { PaymentSourceOptions } from '@/components/add-expense/PaymentSourceOptions';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { CreditCard, Search, CheckSquare, Square, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

interface BulkPaymentSourceDialogProps {
  expenses: Expense[];
  onUpdateExpenses: (expenses: Expense[]) => Promise<void>;
}

export const BulkPaymentSourceDialog = ({ expenses, onUpdateExpenses }: BulkPaymentSourceDialogProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newPaymentSource, setNewPaymentSource] = useState<PaymentSource | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState<PaymentSource | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const { formatAmount } = useCurrency();
  const { customPaymentSources } = useCustomPaymentSources();

  // Filter expenses (exclude transfers, only show expenses and income)
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter(e => e.type !== 'transfer')
      .filter(e => {
        if (filterSource !== 'all' && e.payment_source !== filterSource) return false;
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          return e.description.toLowerCase().includes(search) || 
                 e.merchant_name?.toLowerCase().includes(search);
        }
        return true;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [expenses, filterSource, searchTerm]);

  // Group by current payment source for stats
  const sourceStats = useMemo(() => {
    const stats = new Map<string, number>();
    expenses.filter(e => e.type !== 'transfer').forEach(e => {
      const source = e.payment_source || 'other';
      stats.set(source, (stats.get(source) || 0) + 1);
    });
    return stats;
  }, [expenses]);


  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredExpenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
    }
  };

  const handleApply = async () => {
    if (selectedIds.size === 0 || !newPaymentSource) {
      showError(t('toasts.selectTransactionsAndSource'));
      return;
    }

    setSaving(true);
    try {
      const expensesToUpdate = expenses.filter(e => selectedIds.has(e.id));
      const updatedExpenses = expensesToUpdate.map(e => ({
        ...e,
        payment_source: newPaymentSource,
        updated_at: new Date().toISOString()
      }));

      await onUpdateExpenses(updatedExpenses);
      
      const sourceInfo = getPaymentSourceInfo(newPaymentSource);
      showSuccess(t('toasts.transactionsUpdatedSource', { count: selectedIds.size, name: sourceInfo.name }));
      
      setSelectedIds(new Set());
      setNewPaymentSource('');
      setOpen(false);
    } catch (error) {
      showError(t('toasts.updateError'));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedIds(new Set());
      setSearchTerm('');
      setFilterSource('all');
      setNewPaymentSource('');
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-blue-500 hover:bg-blue-600 text-white dark:bg-blue-600 dark:hover:bg-blue-700">
          <CreditCard className="w-4 h-4" />
          {t('bulk.paymentSource')}
        </Button>
      </DialogTrigger>
      <DialogContent showBackButton={false} className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 pb-2 space-y-4">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              {t('bulk.bulkUpdatePaymentSource', 'Grupno ažuriranje izvora plaćanja')}
            </DialogTitle>
          </DialogHeader>

          {/* Stats */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {Array.from(sourceStats.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([source, count]) => {
                const info = getPaymentSourceInfo(source as PaymentSource);
                return (
                  <Button
                    key={source}
                    variant={filterSource === source ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1 h-7 text-xs"
                    onClick={() => setFilterSource(filterSource === source ? 'all' : source as PaymentSource)}
                  >
                    <span>{info.icon}</span>
                    <span>{info.name}</span>
                    <span className="opacity-60">({count})</span>
                  </Button>
                );
              })}
            {filterSource !== 'all' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilterSource('all')}
              >
                {t('bulk.clearFilter', 'Očisti filter')}
              </Button>
            )}
          </div>

          {/* Search & Select All */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('bulk.searchTransactions', 'Pretraži transakcije...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={selectAll}
            >
              {selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0 ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {selectedIds.size > 0 ? t('bulk.selectedCount', '{{count}} odabrano').replace('{{count}}', String(selectedIds.size)) : t('bulk.selectAll', 'Odaberi sve')}
            </Button>
          </div>

          {/* Transaction List */}
          <div className="space-y-1 min-h-[150px] max-h-[35vh] overflow-y-auto border rounded-lg p-2 bg-muted/20">
            {filteredExpenses.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t('bulk.noTransactionsToShow', 'Nema transakcija za prikaz')}
              </div>
            ) : (
              filteredExpenses.map((expense) => {
                const sourceInfo = getPaymentSourceInfo(expense.payment_source || 'other');
                const isSelected = selectedIds.has(expense.id);
                
                return (
                  <div
                    key={expense.id}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleSelect(expense.id)}
                  >
                    <Checkbox 
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(expense.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{expense.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(expense.date, 'dd.MM.yyyy', { locale: hr })}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          {sourceInfo.icon} {sourceInfo.name}
                        </span>
                      </div>
                    </div>
                    
                    <p className={`font-mono text-sm font-medium ${
                      expense.type === 'income' ? 'text-income' : 'text-expense'
                    }`}>
                      {expense.type === 'income' ? '+' : '-'}{formatAmount(expense.amount)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Action Bar - Fixed at bottom */}
        <div className="flex items-center gap-3 p-4 border-t shrink-0 bg-background">
          <div className="flex-1">
            <Select value={newPaymentSource} onValueChange={(v) => setNewPaymentSource(v as PaymentSource)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('bulk.selectNewPaymentSource', 'Odaberi novi izvor plaćanja...')} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] z-[100]">
                {PAYMENT_SOURCE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                      {group.label}
                    </div>
                    {group.sources.map((src) => (
                      <SelectItem key={src.id} value={src.id}>
                        <span className="flex items-center gap-2">
                          <span>{src.icon}</span>
                          <span>{src.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button
            onClick={handleApply}
            disabled={selectedIds.size === 0 || !newPaymentSource || saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {t('bulk.apply', 'Primijeni')} ({selectedIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
