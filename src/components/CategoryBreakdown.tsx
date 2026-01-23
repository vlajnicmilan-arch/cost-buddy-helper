import { useState } from 'react';
import { CATEGORIES, CategoryInfo, Expense } from '@/types/expense';
import { CategoryTransactionsDialog } from './CategoryTransactionsDialog';
import { EditTransactionDialog } from './EditTransactionDialog';
import { motion } from 'framer-motion';

interface CategoryBreakdownProps {
  expensesByCategory: Record<string, number>;
  total: number;
  expenses: Expense[];
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  hideHeader?: boolean;
}

export const CategoryBreakdown = ({ 
  expensesByCategory, 
  total,
  expenses,
  onUpdateExpense,
  onDeleteExpense,
  hideHeader = false
}: CategoryBreakdownProps) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryInfo | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const sortedCategories = CATEGORIES
    .map(cat => ({
      ...cat,
      amount: expensesByCategory[cat.id] || 0,
      percentage: total > 0 ? ((expensesByCategory[cat.id] || 0) / total) * 100 : 0,
    }))
    .filter(cat => cat.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const handleCategoryClick = (category: CategoryInfo) => {
    setSelectedCategory(category);
    setCategoryDialogOpen(true);
  };

  const handleEditTransaction = (expense: Expense) => {
    setEditingExpense(expense);
    setCategoryDialogOpen(false);
    setEditDialogOpen(true);
  };

  const handleEditSave = async (expense: Expense) => {
    await onUpdateExpense(expense);
    setEditDialogOpen(false);
    setEditingExpense(null);
    // Reopen category dialog
    setCategoryDialogOpen(true);
  };

  if (sortedCategories.length === 0) {
    return (
      <div className={hideHeader ? "" : "glass-card rounded-2xl p-6"}>
        {!hideHeader && <h3 className="text-lg font-semibold mb-4">Po kategorijama</h3>}
        <p className="text-muted-foreground text-sm">Još nema troškova</p>
      </div>
    );
  }

  return (
    <>
      <div className={hideHeader ? "" : "glass-card rounded-2xl p-6"}>
        {!hideHeader && <h3 className="text-lg font-semibold mb-4">Po kategorijama</h3>}
        <div className="space-y-4">
          {sortedCategories.map((cat, index) => (
            <motion.div 
              key={cat.id} 
              className="space-y-2 cursor-pointer group"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleCategoryClick(cat)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 group-hover:text-primary transition-colors">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-sm font-medium">{cat.name}</span>
                </div>
                <span className="text-sm font-mono font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {formatAmount(cat.amount)}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full group-hover:opacity-80 transition-opacity"
                  initial={{ width: 0 }}
                  animate={{ width: `${cat.percentage}%` }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  style={{
                    backgroundColor: `hsl(var(--${cat.color}))`,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-right opacity-0 group-hover:opacity-100 transition-opacity">
                Klikni za detalje i promjenu kategorije
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Category Transactions Dialog */}
      <CategoryTransactionsDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={selectedCategory}
        expenses={expenses}
        onUpdateExpense={onUpdateExpense}
        onDeleteExpense={onDeleteExpense}
        onEditTransaction={handleEditTransaction}
      />

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        expense={editingExpense}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleEditSave}
      />
    </>
  );
};
