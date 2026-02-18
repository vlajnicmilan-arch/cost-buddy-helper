import { useCallback, useMemo } from 'react';
import { Expense } from '@/types/expense';
import { ParsedTransaction } from '@/lib/csvParsers';
import { useExpenseFetch } from './useExpenseFetch';
import { useExpenseCRUD } from './useExpenseCRUD';

interface UseExpensesOptions {
  onBalanceUpdated?: () => void;
}

export const useExpenses = (options?: UseExpensesOptions) => {
  const {
    expenses,
    dashboardExpenses,
    loading,
    isLocalMode,
    setExpenses,
    refetch,
  } = useExpenseFetch();

  const { addExpense, updateExpense, bulkUpdateExpenses, deleteExpense, importFromCSV } =
    useExpenseCRUD({
      isLocalMode,
      expenses,
      setExpenses,
      onBalanceUpdated: options?.onBalanceUpdated,
    });

  // Duplicate detection utilities
  const findDuplicates = useCallback((transactions: ParsedTransaction[]): {
    duplicates: ParsedTransaction[];
    unique: ParsedTransaction[];
  } => {
    const duplicates: ParsedTransaction[] = [];
    const unique: ParsedTransaction[] = [];

    for (const tx of transactions) {
      const isDuplicate = expenses.some(existing => {
        const sameDate = existing.date.toDateString() === tx.date.toDateString();
        const sameAmount = Math.abs(Number(existing.amount) - tx.amount) < 0.01;
        const sameType = existing.type === tx.type;
        const existingDesc = existing.description.toLowerCase();
        const txDesc = tx.description.toLowerCase();
        const similarDesc = existingDesc === txDesc ||
          existingDesc.includes(txDesc) ||
          txDesc.includes(existingDesc) ||
          (existing.merchant_name && tx.merchant_name &&
            existing.merchant_name.toLowerCase() === tx.merchant_name.toLowerCase());
        return sameDate && sameAmount && sameType && similarDesc;
      });
      isDuplicate ? duplicates.push(tx) : unique.push(tx);
    }

    return { duplicates, unique };
  }, [expenses]);

  const checkDuplicate = useCallback((transaction: {
    amount: number;
    description: string;
    date: Date;
    type: string;
    category?: string;
    merchant_name?: string;
  }): Expense | null => {
    const match = expenses.find(existing => {
      const sameDate = existing.date.toDateString() === transaction.date.toDateString();
      const sameAmount = Math.abs(Number(existing.amount) - transaction.amount) < 0.01;
      const sameType = existing.type === transaction.type;
      if (!sameDate || !sameAmount || !sameType) return false;

      const existingDesc = existing.description.toLowerCase().trim();
      const newDesc = transaction.description.toLowerCase().trim();

      if (existingDesc === newDesc) {
        if (existing.merchant_name && transaction.merchant_name) {
          if (existing.merchant_name.toLowerCase().trim() !== transaction.merchant_name.toLowerCase().trim()) return false;
        }
        return true;
      }

      const existingWords = existingDesc.split(/\s+/).filter(w => w.length >= 3);
      const newWords = newDesc.split(/\s+/).filter(w => w.length >= 3);
      const totalUniqueWords = new Set([...existingWords, ...newWords]).size;
      const commonWords = existingWords.filter(w => newWords.includes(w));

      if (totalUniqueWords > 0 && commonWords.length / totalUniqueWords < 0.5) return false;
      if (existingDesc.includes(newDesc) || newDesc.includes(existingDesc)) return true;

      if (existing.merchant_name && transaction.merchant_name) {
        const em = existing.merchant_name.toLowerCase().trim();
        const nm = transaction.merchant_name.toLowerCase().trim();
        if (em === nm && commonWords.length >= 2) return true;
      }

      if (totalUniqueWords > 0 && commonWords.length / totalUniqueWords >= 0.6) return true;
      return false;
    });

    return match || null;
  }, [expenses]);

  // Derived totals (computed from filtered dashboardExpenses)
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const totals = useMemo(() => {
    const totalExpenses = dashboardExpenses
      .filter(e => e.type === 'expense')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalIncome = dashboardExpenses
      .filter(e => e.type === 'income')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalTransfers = dashboardExpenses
      .filter(e => e.type === 'transfer')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const monthlyTransfers = dashboardExpenses
      .filter(e => e.type === 'transfer' && e.date >= currentMonthStart && e.date <= currentMonthEnd)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const transferCount = dashboardExpenses.filter(e => e.type === 'transfer').length;

    const monthlyTransferCount = dashboardExpenses
      .filter(e => e.type === 'transfer' && e.date >= currentMonthStart && e.date <= currentMonthEnd)
      .length;

    const balance = totalIncome - totalExpenses;

    const expensesByCategory = dashboardExpenses
      .filter(e => e.type === 'expense')
      .reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
        return acc;
      }, {} as Record<string, number>);

    return {
      totalExpenses,
      totalIncome,
      totalTransfers,
      monthlyTransfers,
      transferCount,
      monthlyTransferCount,
      balance,
      expensesByCategory,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardExpenses]);

  return {
    expenses: dashboardExpenses, // filtered — for dashboard display
    allExpenses: expenses,       // raw — for income source panels
    loading,
    isLocalMode,
    addExpense,
    updateExpense,
    bulkUpdateExpenses,
    deleteExpense,
    importFromCSV,
    findDuplicates,
    checkDuplicate,
    refetch,
    ...totals,
  };
};
