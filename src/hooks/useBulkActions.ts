import { useState, useCallback } from 'react';
import { Expense, Category } from '@/types/expense';
import { useTranslation } from 'react-i18next';
import { showSuccess } from '@/hooks/useStatusFeedback';

interface UseBulkActionsOptions {
  filteredExpenses: Expense[];
  bulkUpdateExpenses: (expenses: Expense[]) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}

export const useBulkActions = ({
  filteredExpenses,
  bulkUpdateExpenses,
  deleteExpense,
}: UseBulkActionsOptions) => {
  const { t } = useTranslation();
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedTransactionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedTransactionIds(new Set(filteredExpenses.map(e => e.id)));
  }, [filteredExpenses]);

  const handleClearSelection = useCallback(() => {
    setSelectedTransactionIds(new Set());
  }, []);

  const handleBulkCategoryChange = useCallback(async (category: Category) => {
    const selectedExpenses = filteredExpenses.filter(e => selectedTransactionIds.has(e.id));
    await bulkUpdateExpenses(selectedExpenses.map(e => ({ ...e, category })));
    setSelectedTransactionIds(new Set());
    showSuccess(t('transactions.bulkCategoryChanged', { count: selectedExpenses.length }));
  }, [filteredExpenses, selectedTransactionIds, bulkUpdateExpenses, t]);

  const handleBulkPaymentSourceChange = useCallback(async (paymentSource: string) => {
    const selectedExpenses = filteredExpenses.filter(e => selectedTransactionIds.has(e.id));
    await bulkUpdateExpenses(selectedExpenses.map(e => ({ ...e, paymentSource })));
    setSelectedTransactionIds(new Set());
    showSuccess(t('transactions.bulkSourceChanged', { count: selectedExpenses.length }));
  }, [filteredExpenses, selectedTransactionIds, bulkUpdateExpenses, t]);

  const handleBulkBudgetChange = useCallback(async (budgetId: string | null) => {
    const selectedExpenses = filteredExpenses.filter(e => selectedTransactionIds.has(e.id));
    await bulkUpdateExpenses(selectedExpenses.map(e => ({ ...e, budget_id: budgetId })));
    setSelectedTransactionIds(new Set());
    showSuccess(t('transactions.bulkBudgetChanged', { count: selectedExpenses.length }));
  }, [filteredExpenses, selectedTransactionIds, bulkUpdateExpenses, t]);

  const handleBulkProjectChange = useCallback(async (projectId: string | null) => {
    const selectedExpenses = filteredExpenses.filter(e => selectedTransactionIds.has(e.id));
    await bulkUpdateExpenses(selectedExpenses.map(e => ({ ...e, project_id: projectId })));
    setSelectedTransactionIds(new Set());
    showSuccess(t('transactions.bulkProjectChanged', { count: selectedExpenses.length }));
  }, [filteredExpenses, selectedTransactionIds, bulkUpdateExpenses, t]);

  const handleBulkDelete = useCallback(async () => {
    const idsToDelete = Array.from(selectedTransactionIds);
    await Promise.all(idsToDelete.map(id => deleteExpense(id)));
    setSelectedTransactionIds(new Set());
    showSuccess(t('transactions.bulkDeleted', { count: idsToDelete.length }));
  }, [selectedTransactionIds, deleteExpense, t]);

  return {
    selectedTransactionIds,
    setSelectedTransactionIds,
    handleToggleSelect,
    handleSelectAll,
    handleClearSelection,
    handleBulkCategoryChange,
    handleBulkPaymentSourceChange,
    handleBulkBudgetChange,
    handleBulkProjectChange,
    handleBulkDelete,
  };
};
