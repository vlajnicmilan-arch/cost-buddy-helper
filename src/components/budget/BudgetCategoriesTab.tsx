import { useState } from 'react';
import { useBudgetCategories } from '@/hooks/useBudgetCategories';
import { useExpenses } from '@/hooks/useExpenses';
import { BudgetCategory } from '@/types/budget';
import { getCategoryInfo, CATEGORIES, Category } from '@/types/expense';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react';

interface BudgetCategoriesTabProps {
  budgetId: string;
  isOwner: boolean;
}

export const BudgetCategoriesTab = ({ budgetId, isOwner }: BudgetCategoriesTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { categories, loading, addCategory, updateCategory, deleteCategory } = useBudgetCategories(budgetId);
  const { expensesByCategory } = useExpenses();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>('food');
  const [limitAmount, setLimitAmount] = useState('');

  const handleAdd = () => {
    setEditingCategory(null);
    setSelectedCategory('food');
    setLimitAmount('');
    setDialogOpen(true);
  };

  const handleEdit = (cat: BudgetCategory) => {
    setEditingCategory(cat);
    setSelectedCategory(cat.category as Category);
    setLimitAmount(cat.limit_amount.toString());
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!limitAmount || parseFloat(limitAmount) <= 0) return;

    if (editingCategory) {
      await updateCategory({
        ...editingCategory,
        limit_amount: parseFloat(limitAmount)
      });
    } else {
      await addCategory({
        budget_id: budgetId,
        category: selectedCategory,
        limit_amount: parseFloat(limitAmount)
      });
    }

    setDialogOpen(false);
  };

  // Calculate spent amounts from current month expenses
  const categoriesWithSpent = categories.map(cat => ({
    ...cat,
    spent: expensesByCategory[cat.category] || 0
  }));

  const existingCategories = categories.map(c => c.category);
  const availableCategories = CATEGORIES.filter(c => !existingCategories.includes(c.id) || editingCategory?.category === c.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('budget.categoryLimits', 'Limiti po kategorijama')}</h3>
        {isOwner && (
          <Button onClick={handleAdd} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('common.add', 'Dodaj')}
          </Button>
        )}
      </div>

      {categoriesWithSpent.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>{t('budget.noCategories', 'Nema definiranih kategorija')}</p>
          <p className="text-sm">{t('budget.noCategoriesHint', 'Dodaj kategoriju za praćenje potrošnje')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {categoriesWithSpent.map((cat) => {
            const info = getCategoryInfo(cat.category as Category);
            const percentage = cat.limit_amount > 0 ? (cat.spent / cat.limit_amount) * 100 : 0;
            const isOverBudget = percentage > 100;

            return (
              <Card key={cat.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{info.icon}</span>
                      <div>
                        <p className="font-medium">{info.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatAmount(cat.spent)} / {formatAmount(cat.limit_amount)}
                        </p>
                      </div>
                    </div>
                    {isOwner && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(cat)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteCategory(cat.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <Progress 
                    value={Math.min(percentage, 100)} 
                    className={isOverBudget ? '[&>div]:bg-destructive' : ''} 
                  />
                  {isOverBudget && (
                    <p className="text-xs text-destructive mt-1">
                      {t('budget.overBudget', 'Prekoračen budžet za {{amount}}', { amount: formatAmount(cat.spent - cat.limit_amount) })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? t('budget.editCategory', 'Uredi kategoriju') : t('budget.addCategory', 'Dodaj kategoriju')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.category', 'Kategorija')}</Label>
              <Select 
                value={selectedCategory} 
                onValueChange={(v) => setSelectedCategory(v as Category)}
                disabled={!!editingCategory}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        {cat.icon} {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('budget.limit', 'Mjesečni limit')}</Label>
              <Input
                type="number"
                value={limitAmount}
                onChange={(e) => setLimitAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button onClick={handleSubmit}>
              {editingCategory ? t('common.save', 'Spremi') : t('common.add', 'Dodaj')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
