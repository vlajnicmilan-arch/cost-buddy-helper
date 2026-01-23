import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Expense, Category, CATEGORIES, getCategoryInfo } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Tags, Search, CheckSquare, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useTranslation } from 'react-i18next';

interface BulkCategoryDialogProps {
  expenses: Expense[];
  onUpdateExpenses: (expenses: Expense[]) => Promise<void>;
}

// Group categories for better organization
const CATEGORY_GROUPS = [
  {
    label: 'Hrana i namirnice',
    categories: ['food', 'groceries'] as Category[]
  },
  {
    label: 'Transport',
    categories: ['transport', 'car'] as Category[]
  },
  {
    label: 'Kupovina',
    categories: ['shopping', 'clothing', 'gifts'] as Category[]
  },
  {
    label: 'Zabava',
    categories: ['entertainment', 'subscriptions', 'travel'] as Category[]
  },
  {
    label: 'Režije i računi',
    categories: ['bills', 'utilities', 'rent', 'home', 'insurance', 'taxes'] as Category[]
  },
  {
    label: 'Zdravlje i ljepota',
    categories: ['health', 'beauty', 'sports'] as Category[]
  },
  {
    label: 'Ostalo',
    categories: ['education', 'pets', 'kids', 'savings', 'investments', 'charity', 'other'] as Category[]
  }
];

export const BulkCategoryDialog = ({ expenses, onUpdateExpenses }: BulkCategoryDialogProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newCategory, setNewCategory] = useState<Category | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const { formatAmount } = useCurrency();
  
  const { customCategories } = useCustomCategories();

  // Filter expenses (exclude transfers, only show expenses and income)
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

  // Group by current category for stats
  const categoryStats = useMemo(() => {
    const stats = new Map<string, number>();
    expenses.filter(e => e.type !== 'transfer').forEach(e => {
      const category = e.category || 'other';
      stats.set(category, (stats.get(category) || 0) + 1);
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

  // Get category info including custom categories
  const getCategoryInfoExtended = (categoryId: string) => {
    const systemCategory = CATEGORIES.find(c => c.id === categoryId);
    if (systemCategory) return systemCategory;
    
    const customCategory = customCategories.find(c => c.id === categoryId);
    if (customCategory) {
      return {
        id: customCategory.id as Category,
        name: customCategory.name,
        icon: customCategory.icon,
        color: customCategory.color
      };
    }
    
    return CATEGORIES[CATEGORIES.length - 1]; // 'other'
  };

  const handleApply = async () => {
    if (selectedIds.size === 0 || !newCategory) {
      toast.error('Odaberi transakcije i novu kategoriju');
      return;
    }

    setSaving(true);
    try {
      const expensesToUpdate = expenses.filter(e => selectedIds.has(e.id));
      const updatedExpenses = expensesToUpdate.map(e => ({
        ...e,
        category: newCategory,
        updated_at: new Date().toISOString()
      }));

      await onUpdateExpenses(updatedExpenses);
      
      const categoryInfo = getCategoryInfoExtended(newCategory);
      toast.success(`Ažurirano ${selectedIds.size} transakcija na "${categoryInfo.name}"`);
      
      setSelectedIds(new Set());
      setNewCategory('');
      setOpen(false);
    } catch (error) {
      toast.error('Greška pri ažuriranju transakcija');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedIds(new Set());
      setSearchTerm('');
      setFilterCategory('all');
      setNewCategory('');
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-purple-500 hover:bg-purple-600 text-white dark:bg-purple-600 dark:hover:bg-purple-700">
          <Tags className="w-4 h-4" />
          {t('bulk.category')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 pb-2 space-y-4">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Tags className="w-5 h-5" />
              Grupno ažuriranje kategorija
            </DialogTitle>
          </DialogHeader>

          {/* Stats */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {Array.from(categoryStats.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([category, count]) => {
                const info = getCategoryInfoExtended(category);
                return (
                  <Button
                    key={category}
                    variant={filterCategory === category ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1 h-7 text-xs"
                    onClick={() => setFilterCategory(filterCategory === category ? 'all' : category as Category)}
                  >
                    <span>{info.icon}</span>
                    <span>{info.name}</span>
                    <span className="opacity-60">({count})</span>
                  </Button>
                );
              })}
            {filterCategory !== 'all' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilterCategory('all')}
              >
                Očisti filter
              </Button>
            )}
          </div>

          {/* Search & Select All */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Pretraži transakcije..."
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
              {selectedIds.size > 0 ? `${selectedIds.size} odabrano` : 'Odaberi sve'}
            </Button>
          </div>

          {/* Transaction List */}
          <div className="space-y-1 min-h-[150px] max-h-[35vh] overflow-y-auto border rounded-lg p-2 bg-muted/20">
            {filteredExpenses.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Nema transakcija za prikaz
              </div>
            ) : (
              filteredExpenses.map((expense) => {
                const categoryInfo = getCategoryInfoExtended(expense.category);
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
                          {categoryInfo.icon} {categoryInfo.name}
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
            <Select value={newCategory} onValueChange={(v) => setNewCategory(v as Category)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Odaberi novu kategoriju..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] z-[100]">
                {/* System categories grouped */}
                {CATEGORY_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                      {group.label}
                    </div>
                    {group.categories.map((catId) => {
                      const info = getCategoryInfo(catId);
                      return (
                        <SelectItem key={catId} value={catId}>
                          <span className="flex items-center gap-2">
                            <span>{info.icon}</span>
                            <span>{info.name}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </div>
                ))}
                
                {/* Custom categories */}
                {customCategories.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                      Prilagođene kategorije
                    </div>
                    {customCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <span className="flex items-center gap-2">
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <Button
            onClick={handleApply}
            disabled={selectedIds.size === 0 || !newCategory || saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Primijeni ({selectedIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
