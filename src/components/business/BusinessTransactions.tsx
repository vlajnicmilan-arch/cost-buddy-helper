import { useState, useMemo } from 'react';
import { Plus, Search, ArrowUpRight, ArrowDownRight, ArrowLeftRight, FileText, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { ImportBatchDialog } from '@/components/ImportBatchDialog';
import { TransactionItem } from '@/components/TransactionItem';
import { BankConnection } from '@/components/BankConnection';
import { ParsedTransaction } from '@/lib/csvParsers';
import { useTranslation } from 'react-i18next';

interface Props {
  expenses: Expense[];
  onAddClick: () => void;
  onEditExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => void;
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: (transactions: ParsedTransaction[]) => { duplicates: ParsedTransaction[]; fuzzyDuplicates: ParsedTransaction[]; fuzzyMatchedExpenses: import('@/types/expense').Expense[]; autoGenMatches: { tx: ParsedTransaction; existing: import('@/types/expense').Expense }[]; unique: ParsedTransaction[] };
  existingExpenses?: Expense[];
}

export const BusinessTransactions = ({ expenses, onAddClick, onEditExpense, onDeleteExpense, onImportCSV, findDuplicates, existingExpenses }: Props) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [importBatchDialogOpen, setImportBatchDialogOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

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
    const validIds = new Set(expenses.map(e => e.id));
    const safeIds = expenseIds.filter(id => validIds.has(id));
    for (const id of safeIds) {
      onDeleteExpense(id);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('business.transactions.search', 'Pretraži...')} className="pl-8 h-9 text-sm" />
        </div>
        <Button size="sm" className="h-9 gap-1" onClick={onAddClick}>
          <Plus className="w-3.5 h-3.5" />
          {t('business.transactions.new', 'Novo')}
        </Button>
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

      <BankConnection onImportCSV={onImportCSV} findDuplicates={findDuplicates} existingExpenses={existingExpenses} />

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
