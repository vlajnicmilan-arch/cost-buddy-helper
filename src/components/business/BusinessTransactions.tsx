import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { Plus, Search, ArrowUpRight, ArrowDownRight, ArrowLeftRight, FileText, ScanLine, Wallet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { ImportBatchDialog } from '@/components/ImportBatchDialog';
import { TransactionItem } from '@/components/TransactionItem';
import { BankConnection } from '@/components/BankConnection';
import { ParsedTransaction } from '@/lib/csvParsers';
import { useTranslation } from 'react-i18next';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useAppState } from '@/contexts/AppStateContext';

interface Props {
  expenses: Expense[];
  onAddClick: () => void;
  onScanClick?: () => void;
  addAction?: ReactNode;
  scanAction?: ReactNode;
  onEditExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => void;
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: FindPdfDuplicatesHandler;
  existingExpenses?: Expense[];
}

export const BusinessTransactions = ({ expenses, onAddClick, onScanClick, addAction, scanAction, onEditExpense, onDeleteExpense, onImportCSV, findDuplicates, existingExpenses }: Props) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { customPaymentSources } = useCustomPaymentSources();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [importBatchDialogOpen, setImportBatchDialogOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // Sources that belong to the active business profile (bankovni izvod uvijek dolazi s tvrtkinog računa)
  const businessSources = useMemo(
    () => customPaymentSources.filter(s => s.business_profile_id === activeBusinessProfileId),
    [customPaymentSources, activeBusinessProfileId]
  );

  const lsKey = activeBusinessProfileId ? `bankImportSource:${activeBusinessProfileId}` : null;
  const [selectedImportSourceId, setSelectedImportSourceId] = useState<string | undefined>(() => {
    if (!lsKey) return undefined;
    const stored = localStorage.getItem(lsKey);
    return stored || undefined;
  });

  // Auto-select default when sources load / change
  useEffect(() => {
    if (businessSources.length === 0) {
      setSelectedImportSourceId(undefined);
      return;
    }
    if (!selectedImportSourceId || !businessSources.some(s => s.id === selectedImportSourceId)) {
      const fallback = businessSources[0].id;
      setSelectedImportSourceId(fallback);
      if (lsKey) localStorage.setItem(lsKey, fallback);
    }
  }, [businessSources, selectedImportSourceId, lsKey]);

  const handleSourceChange = (id: string) => {
    setSelectedImportSourceId(id);
    if (lsKey) localStorage.setItem(lsKey, id);
  };

  const filtered = useMemo(() => {
    let result = expenses;
    if (typeFilter) result = result.filter(e => e.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.merchant_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [expenses, typeFilter, search]);

  const handleDeleteBatch = async (expenseIds: string[]) => {
    // Only delete expenses that are actually in our filtered list (safety check)
    const expMap = new Map(expenses.map(e => [e.id, e]));
    const safeIds = expenseIds.filter(id => expMap.has(id));
    const { supabase } = await import('@/integrations/supabase/client');
    await Promise.allSettled(safeIds.map(async (id) => {
      const exp = expMap.get(id);
      if (exp?.bank_match_status === 'confirmed') {
        const { error } = await supabase.rpc('unmerge_import_row', { p_id: id });
        if (error) throw error;
      } else {
        onDeleteExpense(id);
      }
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('business.transactions.search', 'Pretraži...')} className="pl-8 h-9 text-sm" />
        </div>
        {scanAction ?? (onScanClick && (
          <Button size="sm" variant="outline" className="h-9 gap-1 border-primary/30 text-primary" onClick={onScanClick}>
            <ScanLine className="w-3.5 h-3.5" />
            {t('common.scan', 'Skeniraj')}
          </Button>
        ))}
        {addAction ?? (
          <Button size="sm" className="h-9 gap-1" onClick={onAddClick}>
            <Plus className="w-3.5 h-3.5" />
            {t('business.transactions.new', 'Novo')}
          </Button>
        )}
      </div>

      <div className="flex gap-1.5">
        {[
          { value: null, label: t('business.transactions.all', 'Sve') },
          { value: 'expense', label: t('business.transactions.expenses', 'Rashodi') },
          { value: 'income', label: t('business.transactions.income', 'Prihodi') },
          { value: 'transfer', label: t('business.transactions.transfers', 'Transferi') },
        ].map(f => (
          <Badge
            key={f.label}
            variant={typeFilter === f.value ? 'default' : 'outline'}
            className="cursor-pointer text-[10px] px-2 py-0.5"
            onClick={() => setTypeFilter(f.value)}
          >
            {f.label}
          </Badge>
        ))}
      </div>

      <div className="space-y-0">
        {filtered.map((expense, index) => {
          const prevExpense = index > 0 ? filtered[index - 1] : null;
          const showBatchStart = expense.import_batch_id &&
            (!prevExpense || prevExpense.import_batch_id !== expense.import_batch_id);
          const batchExpenseCount = showBatchStart
            ? filtered.filter(e => e.import_batch_id === expense.import_batch_id).length
            : 0;

          return (
            <div key={expense.id}>
              {showBatchStart && (
                <div
                  className="flex items-center gap-2 my-2 px-2 cursor-pointer group"
                  onClick={() => {
                    setSelectedBatchId(expense.import_batch_id!);
                    setImportBatchDialogOpen(true);
                  }}
                >
                  <div className="flex-1 h-px bg-destructive/40" />
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 group-hover:bg-destructive/20 transition-colors">
                    <FileText className="w-3 h-3 text-destructive" />
                    <span className="text-[11px] font-medium text-destructive">
                      Uvoz • {batchExpenseCount} tr.
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-destructive/40" />
                </div>
              )}
              <TransactionItem
                expense={expense}
                onDelete={onDeleteExpense}
                onClick={(e) => setDetailExpense(e)}
              />
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{t('business.transactions.noTransactions', 'Nema transakcija')}</p>
          </div>
        )}
      </div>

      {/* Business import: bankovni izvod uvijek dolazi s jednog tvrtkinog računa */}
      {businessSources.length === 0 ? (
        <div className="glass-card rounded-2xl p-4 flex items-start gap-3 border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {t('import.noBusinessSourceWarning', 'Najprije dodaj poslovni izvor plaćanja (račun tvrtke) za koji uvoziš izvod.')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('import.noBusinessSourceHint', 'Postavke → Izvori plaćanja → Dodaj novi (vezan na ovu tvrtku).')}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {businessSources.length > 1 && (
            <div className="glass-card rounded-2xl p-3 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">
                {t('import.linkedToSource', 'Uvoz se vezuje na izvor:')}
              </span>
              <Select value={selectedImportSourceId} onValueChange={handleSourceChange}>
                <SelectTrigger className="h-8 text-sm flex-1">
                  <SelectValue placeholder={t('import.selectBusinessSource', 'Odaberi izvor')} />
                </SelectTrigger>
                <SelectContent>
                  {businessSources.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {businessSources.length === 1 && (
            <p className="text-[11px] text-muted-foreground px-1">
              {t('import.linkedToSource', 'Uvoz se vezuje na izvor:')} <strong>{businessSources[0].name}</strong>
            </p>
          )}
          <BankConnection
            onImportCSV={onImportCSV}
            findDuplicates={findDuplicates}
            existingExpenses={existingExpenses}
            defaultBusinessPaymentSourceId={selectedImportSourceId}
          />
        </div>
      )}

      {detailExpense && (
        <TransactionDetailDialog
          expense={detailExpense}
          open={!!detailExpense}
          onOpenChange={(open) => !open && setDetailExpense(null)}
          onEdit={(e) => { setDetailExpense(null); setEditExpense(e); }}
          onDelete={(id) => { onDeleteExpense(id); setDetailExpense(null); }}
        />
      )}

      {editExpense && (
        <EditTransactionDialog
          expense={editExpense}
          open={!!editExpense}
          onOpenChange={(open) => !open && setEditExpense(null)}
          onSave={async (updatedExpense) => { await onEditExpense(updatedExpense); setEditExpense(null); }}
        />
      )}

      {selectedBatchId && (
        <ImportBatchDialog
          open={importBatchDialogOpen}
          onOpenChange={setImportBatchDialogOpen}
          batchId={selectedBatchId}
          allExpenses={expenses}
          onDeleteBatch={handleDeleteBatch}
        />
      )}
    </div>
  );
};
