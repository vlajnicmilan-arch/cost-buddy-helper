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

  // Normalize merchant name: strip legal suffixes, punctuation, lowercase
  const normalizeMerchant = useCallback((name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/\b(d\.o\.o\.?|d\.d\.?|j\.d\.o\.o\.?|obrt|trgovina|trgovački|poslovanje|hotel)\b/gi, '')
      .replace(/[.,&\-_'"()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  // Check if two merchant names are similar (fuzzy match)
  const areMerchantsSimilar = useCallback((a: string, b: string): boolean => {
    const na = normalizeMerchant(a);
    const nb = normalizeMerchant(b);
    if (na === nb) return true;
    if (na.length < 2 || nb.length < 2) return false;
    if (na.includes(nb) || nb.includes(na)) return true;
    const wa = na.split(/\s+/).filter(w => w.length >= 3);
    const wb = nb.split(/\s+/).filter(w => w.length >= 3);
    if (wa.length === 0 || wb.length === 0) return false;
    const common = wa.filter(w => wb.some(w2 => w2.includes(w) || w.includes(w2)));
    const minLen = Math.min(wa.length, wb.length);
    return common.length / minLen >= 0.5;
  }, [normalizeMerchant]);

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
        if (!sameDate || !sameAmount || !sameType) return false;

        // Fuzzy merchant match
        if (existing.merchant_name && tx.merchant_name &&
            areMerchantsSimilar(existing.merchant_name, tx.merchant_name)) return true;

        const existingDesc = existing.description.toLowerCase();
        const txDesc = tx.description.toLowerCase();
        return existingDesc === txDesc ||
          existingDesc.includes(txDesc) ||
          txDesc.includes(existingDesc);
      });
      isDuplicate ? duplicates.push(tx) : unique.push(tx);
    }

    return { duplicates, unique };
  }, [expenses, areMerchantsSimilar]);


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

      // If both have merchant names, use fuzzy merchant matching as primary signal
      if (existing.merchant_name && transaction.merchant_name) {
        if (areMerchantsSimilar(existing.merchant_name, transaction.merchant_name)) return true;
      }

      const existingDesc = existing.description.toLowerCase().trim();
      const newDesc = transaction.description.toLowerCase().trim();

      if (existingDesc === newDesc) return true;

      const existingWords = existingDesc.split(/\s+/).filter(w => w.length >= 3);
      const newWords = newDesc.split(/\s+/).filter(w => w.length >= 3);
      const totalUniqueWords = new Set([...existingWords, ...newWords]).size;
      const commonWords = existingWords.filter(w => newWords.includes(w));

      if (totalUniqueWords > 0 && commonWords.length / totalUniqueWords < 0.5) return false;
      if (existingDesc.includes(newDesc) || newDesc.includes(existingDesc)) return true;

      if (totalUniqueWords > 0 && commonWords.length / totalUniqueWords >= 0.6) return true;
      return false;
    });

    return match || null;
  }, [expenses, areMerchantsSimilar]);

  // Derived totals (computed from filtered dashboardExpenses)
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const totals = useMemo(() => {
    const totalExpenses = dashboardExpenses
      .filter(e => e.type === 'expense' && (e.expense_nature as string) !== 'correction')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalIncome = dashboardExpenses
      .filter(e => e.type === 'income' && (e.expense_nature as string) !== 'correction')
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
      .filter(e => e.type === 'expense' && (e.expense_nature as string) !== 'correction')
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
