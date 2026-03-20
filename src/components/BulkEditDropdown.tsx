import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Expense } from '@/types/expense';
import { Settings2, CreditCard, Tags, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BulkPaymentSourceDialog } from './BulkPaymentSourceDialog';
import { BulkCategoryDialog } from './BulkCategoryDialog';
import { RecategorizeDialog } from './RecategorizeDialog';

interface BulkEditDropdownProps {
  expenses: Expense[];
  onUpdateExpenses: (expenses: Expense[]) => Promise<void>;
}

export const BulkEditDropdown = ({ expenses, onUpdateExpenses }: BulkEditDropdownProps) => {
  const { t } = useTranslation();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [recategorizeDialogOpen, setRecategorizeDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-2 bg-indigo-500 hover:bg-indigo-600 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700">
            <Settings2 className="w-4 h-4" />
            {t('bulk.bulkEdit', 'Grupno uređivanje')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => setPaymentDialogOpen(true)} className="gap-2 cursor-pointer">
            <CreditCard className="w-4 h-4" />
            {t('bulk.paymentSource', 'Plaćanje')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCategoryDialogOpen(true)} className="gap-2 cursor-pointer">
            <Tags className="w-4 h-4" />
            {t('bulk.category', 'Kategorija')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setRecategorizeDialogOpen(true)} className="gap-2 cursor-pointer">
            <Sparkles className="w-4 h-4 text-amber-500" />
            AI Rekategorizacija
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BulkPaymentSourceDialogControlled 
        expenses={expenses} 
        onUpdateExpenses={onUpdateExpenses}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
      />

      <BulkCategoryDialogControlled 
        expenses={expenses} 
        onUpdateExpenses={onUpdateExpenses}
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
      />

      <RecategorizeDialog
        expenses={expenses}
        onUpdateExpenses={onUpdateExpenses}
        open={recategorizeDialogOpen}
        onOpenChange={setRecategorizeDialogOpen}
      />
    </>
  );
};

// Controlled versions of the dialogs
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PaymentSource, PAYMENT_SOURCE_GROUPS, getPaymentSourceInfo, Category, CATEGORIES, getCategoryInfo } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Search, CheckSquare, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomCategories } from '@/hooks/useCustomCategories';

interface BulkPaymentSourceDialogControlledProps {
  expenses: Expense[];
  onUpdateExpenses: (expenses: Expense[]) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BulkPaymentSourceDialogControlled = ({ expenses, onUpdateExpenses, open, onOpenChange }: BulkPaymentSourceDialogControlledProps) => {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newPaymentSource, setNewPaymentSource] = useState<PaymentSource | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState<PaymentSource | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const { formatAmount } = useCurrency();

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
      toast.error(t('toasts.selectTransactionsAndSource'));
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
      toast.success(t('toasts.transactionsUpdatedSource', { count: selectedIds.size, name: sourceInfo.name }));
      
      handleClose();
    } catch (error) {
      toast.error(t('toasts.updateError'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setSearchTerm('');
    setFilterSource('all');
    setNewPaymentSource('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? onOpenChange(true) : handleClose()}>
      <DialogContent showBackButton={false} className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 pb-2 space-y-4">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Grupno ažuriranje izvora plaćanja
            </DialogTitle>
          </DialogHeader>

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
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterSource('all')}>
                Očisti filter
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder={t('placeholders.searchTransactions')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
            </div>
            <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={selectAll}>
              {selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {selectedIds.size > 0 ? `${selectedIds.size} odabrano` : 'Odaberi sve'}
            </Button>
          </div>

          <div className="space-y-1 min-h-[150px] max-h-[35vh] overflow-y-auto border rounded-lg p-2 bg-muted/20">
            {filteredExpenses.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Nema transakcija za prikaz</div>
            ) : (
              filteredExpenses.map((expense) => {
                const sourceInfo = getPaymentSourceInfo(expense.payment_source || 'other');
                const isSelected = selectedIds.has(expense.id);
                return (
                  <div key={expense.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`} onClick={() => toggleSelect(expense.id)}>
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(expense.id)} onClick={(e) => e.stopPropagation()} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{expense.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(expense.date, 'dd.MM.yyyy', { locale: hr })}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">{sourceInfo.icon} {sourceInfo.name}</span>
                      </div>
                    </div>
                    <p className={`font-mono text-sm font-medium ${expense.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {expense.type === 'income' ? '+' : '-'}{formatAmount(expense.amount)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 border-t shrink-0 bg-background">
          <div className="flex-1">
            <Select value={newPaymentSource} onValueChange={(v) => setNewPaymentSource(v as PaymentSource)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('placeholders.selectNewPaymentSource')} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] z-[100]">
                {PAYMENT_SOURCE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">{group.label}</div>
                    {group.sources.map((src) => (
                      <SelectItem key={src.id} value={src.id}>
                        <span className="flex items-center gap-2"><span>{src.icon}</span><span>{src.name}</span></span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleApply} disabled={selectedIds.size === 0 || !newPaymentSource || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Primijeni ({selectedIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Category Groups
const CATEGORY_GROUPS = [
  { label: 'Hrana i namirnice', categories: ['food', 'groceries'] as Category[] },
  { label: 'Transport', categories: ['transport', 'car'] as Category[] },
  { label: 'Kupovina', categories: ['shopping', 'clothing', 'gifts'] as Category[] },
  { label: 'Zabava', categories: ['entertainment', 'subscriptions', 'travel'] as Category[] },
  { label: 'Režije i računi', categories: ['bills', 'utilities', 'rent', 'home', 'insurance', 'taxes'] as Category[] },
  { label: 'Zdravlje i ljepota', categories: ['health', 'beauty', 'sports'] as Category[] },
  { label: 'Ostalo', categories: ['education', 'pets', 'kids', 'savings', 'investments', 'charity', 'other'] as Category[] }
];

interface BulkCategoryDialogControlledProps {
  expenses: Expense[];
  onUpdateExpenses: (expenses: Expense[]) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BulkCategoryDialogControlled = ({ expenses, onUpdateExpenses, open, onOpenChange }: BulkCategoryDialogControlledProps) => {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newCategory, setNewCategory] = useState<Category | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const { formatAmount } = useCurrency();
  const { customCategories } = useCustomCategories();

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter(e => e.type !== 'transfer')
      .filter(e => {
        if (filterCategory !== 'all' && e.category !== filterCategory) return false;
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          return e.description.toLowerCase().includes(search) || 
                 e.merchant_name?.toLowerCase().includes(search);
        }
        return true;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [expenses, filterCategory, searchTerm]);

  const categoryStats = useMemo(() => {
    const stats = new Map<string, number>();
    expenses.filter(e => e.type !== 'transfer').forEach(e => {
      const category = e.category || 'other';
      stats.set(category, (stats.get(category) || 0) + 1);
    });
    return stats;
  }, [expenses]);

  const getCategoryInfoExtended = (categoryId: string) => {
    const systemCategory = CATEGORIES.find(c => c.id === categoryId);
    if (systemCategory) return systemCategory;
    const customCategory = customCategories.find(c => c.id === categoryId);
    if (customCategory) {
      return { id: customCategory.id as Category, name: customCategory.name, icon: customCategory.icon, color: customCategory.color };
    }
    return CATEGORIES[CATEGORIES.length - 1];
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredExpenses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
  };

  const handleApply = async () => {
    if (selectedIds.size === 0 || !newCategory) {
      toast.error(t('toasts.selectTransactionsAndCategory'));
      return;
    }
    setSaving(true);
    try {
      const expensesToUpdate = expenses.filter(e => selectedIds.has(e.id));
      const updatedExpenses = expensesToUpdate.map(e => ({ ...e, category: newCategory, updated_at: new Date().toISOString() }));
      await onUpdateExpenses(updatedExpenses);
      const categoryInfo = getCategoryInfoExtended(newCategory);
      toast.success(t('toasts.transactionsUpdatedCategory', { count: selectedIds.size, name: categoryInfo.name }));
      handleClose();
    } catch (error) {
      toast.error(t('toasts.updateError'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setSearchTerm('');
    setFilterCategory('all');
    setNewCategory('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? onOpenChange(true) : handleClose()}>
      <DialogContent showBackButton={false} className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 pb-2 space-y-4">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Tags className="w-5 h-5" />
              Grupno ažuriranje kategorija
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 shrink-0">
            {Array.from(categoryStats.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([category, count]) => {
                const info = getCategoryInfoExtended(category);
                return (
                  <Button key={category} variant={filterCategory === category ? 'default' : 'outline'} size="sm" className="gap-1 h-7 text-xs" onClick={() => setFilterCategory(filterCategory === category ? 'all' : category as Category)}>
                    <span>{info.icon}</span>
                    <span>{info.name}</span>
                    <span className="opacity-60">({count})</span>
                  </Button>
                );
              })}
            {filterCategory !== 'all' && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterCategory('all')}>Očisti filter</Button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder={t('placeholders.searchTransactions')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
            </div>
            <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={selectAll}>
              {selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {selectedIds.size > 0 ? `${selectedIds.size} odabrano` : 'Odaberi sve'}
            </Button>
          </div>

          <div className="space-y-1 min-h-[150px] max-h-[35vh] overflow-y-auto border rounded-lg p-2 bg-muted/20">
            {filteredExpenses.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Nema transakcija za prikaz</div>
            ) : (
              filteredExpenses.map((expense) => {
                const categoryInfo = getCategoryInfoExtended(expense.category);
                const isSelected = selectedIds.has(expense.id);
                return (
                  <div key={expense.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`} onClick={() => toggleSelect(expense.id)}>
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(expense.id)} onClick={(e) => e.stopPropagation()} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{expense.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(expense.date, 'dd.MM.yyyy', { locale: hr })}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">{categoryInfo.icon} {categoryInfo.name}</span>
                      </div>
                    </div>
                    <p className={`font-mono text-sm font-medium ${expense.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {expense.type === 'income' ? '+' : '-'}{formatAmount(expense.amount)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 border-t shrink-0 bg-background">
          <div className="flex-1">
            <Select value={newCategory} onValueChange={(v) => setNewCategory(v as Category)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Odaberi novu kategoriju..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] z-[100]">
                {CATEGORY_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">{group.label}</div>
                    {group.categories.map((catId) => {
                      const info = getCategoryInfo(catId);
                      return (
                        <SelectItem key={catId} value={catId}>
                          <span className="flex items-center gap-2"><span>{info.icon}</span><span>{info.name}</span></span>
                        </SelectItem>
                      );
                    })}
                  </div>
                ))}
                {customCategories.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">Prilagođene kategorije</div>
                    {customCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <span className="flex items-center gap-2"><span>{cat.icon}</span><span>{cat.name}</span></span>
                      </SelectItem>
                    ))}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleApply} disabled={selectedIds.size === 0 || !newCategory || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Primijeni ({selectedIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};