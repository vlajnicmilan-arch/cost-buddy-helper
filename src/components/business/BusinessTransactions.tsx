import { useState, useMemo } from 'react';
import { Plus, Search, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Expense } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { BankConnection } from '@/components/BankConnection';
import { ParsedTransaction } from '@/lib/csvParsers';

interface Props {
  expenses: Expense[];
  onAddClick: () => void;
  onEditExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => void;
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: (transactions: ParsedTransaction[]) => { duplicates: ParsedTransaction[]; unique: ParsedTransaction[] };
  existingExpenses?: Expense[];
}

export const BusinessTransactions = ({ expenses, onAddClick, onEditExpense, onDeleteExpense, onImportCSV, findDuplicates, existingExpenses }: Props) => {
  const { formatAmount } = useCurrency();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);

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

  const typeIcon = (type: string) => {
    if (type === 'income') return <ArrowUpRight className="w-3.5 h-3.5 text-income" />;
    if (type === 'transfer') return <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />;
    return <ArrowDownRight className="w-3.5 h-3.5 text-expense" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pretraži..." className="pl-8 h-9 text-sm" />
        </div>
        <Button size="sm" className="h-9 gap-1" onClick={onAddClick}>
          <Plus className="w-3.5 h-3.5" />
          Novo
        </Button>
      </div>

      <div className="flex gap-1.5">
        {[
          { value: null, label: 'Sve' },
          { value: 'expense', label: 'Rashodi' },
          { value: 'income', label: 'Prihodi' },
          { value: 'transfer', label: 'Transferi' },
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

      <div className="space-y-1">
        {filtered.map(expense => (
          <button
            key={expense.id}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-muted/50 transition-colors text-left"
            onClick={() => setDetailExpense(expense)}
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              {typeIcon(expense.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{expense.description}</p>
              <p className="text-[10px] text-muted-foreground">
                {format(expense.date, 'dd.MM.yyyy')} · {expense.category}
              </p>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${
              expense.type === 'income' ? 'text-income' : expense.type === 'transfer' ? 'text-primary' : 'text-expense'
            }`}>
              {expense.type === 'income' ? '+' : expense.type === 'expense' ? '-' : ''}{formatAmount(expense.amount)}
            </span>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Nema transakcija</p>
          </div>
        )}
      </div>

      {/* Bank Statement Import */}
      <BankConnection onImportCSV={onImportCSV} findDuplicates={findDuplicates} existingExpenses={existingExpenses} />
      </div>

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
    </div>
  );
};
