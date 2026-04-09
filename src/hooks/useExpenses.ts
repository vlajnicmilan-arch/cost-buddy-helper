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

  const DAY_MS = 86400000;

  /**
   * Score a transaction against an existing expense using 3 criteria:
   * 1. Amount: same amount (±1%) and same type → 1 point
   * 2. Date: within ±5 days → 1 point
   * 3. Description/Merchant: fuzzy match → 1 point
   * Returns score 0-3 and whether the existing is auto-generated
   */
  const scoreDuplicate = useCallback((
    tx: { amount: number; type: string; date: Date; description: string; merchant_name?: string },
    existing: Expense
  ): { score: number; isAutoGen: boolean } => {
    let score = 0;

    // Criterion 1: Amount (±1%) and same type
    const sameType = existing.type === tx.type;
    const amountDiff = Math.abs(Number(existing.amount) - tx.amount) / Math.max(Math.abs(tx.amount), 0.01);
    if (sameType && amountDiff <= 0.01) score++;

    // Criterion 2: Date within ±5 days
    const existingTime = existing.date.getTime();
    const txTime = tx.date.getTime();
    const dayDiff = Math.abs(existingTime - txTime) / DAY_MS;
    if (dayDiff <= 5) score++;

    // Criterion 3: Description/Merchant fuzzy match
    let descMatch = false;
    if (existing.merchant_name && tx.merchant_name &&
        areMerchantsSimilar(existing.merchant_name, tx.merchant_name)) {
      descMatch = true;
    }
    if (!descMatch) {
      const existingDesc = existing.description.toLowerCase().trim();
      const txDesc = tx.description.toLowerCase().trim();
      if (existingDesc === txDesc) {
        descMatch = true;
      } else if (existingDesc.includes(txDesc) || txDesc.includes(existingDesc)) {
        descMatch = true;
      } else {
        const wa = existingDesc.split(/\s+/).filter(w => w.length >= 3);
        const wb = txDesc.split(/\s+/).filter(w => w.length >= 3);
        if (wa.length > 0 && wb.length > 0) {
          const common = wa.filter(w => wb.some(w2 => w2.includes(w) || w.includes(w2)));
          const minLen = Math.min(wa.length, wb.length);
          if (common.length / minLen >= 0.5) descMatch = true;
        }
      }
    }
    if (descMatch) score++;

    // Check if existing is auto-generated recurring
    const note = (existing.note || '').toLowerCase();
    const isAutoGen = note.includes('ponavljajuća') || note.includes('(auto)') || note.includes('automatski');

    return { score, isAutoGen };
  }, [areMerchantsSimilar]);

  // Duplicate detection with 2-of-3 scoring system
  const findDuplicates = useCallback((transactions: ParsedTransaction[]): {
    duplicates: ParsedTransaction[];
    fuzzyDuplicates: ParsedTransaction[];
    fuzzyMatchedExpenses: Expense[];
    autoGenMatches: { tx: ParsedTransaction; existing: Expense }[];
    unique: ParsedTransaction[];
  } => {
    const duplicates: ParsedTransaction[] = [];
    const fuzzyDuplicates: ParsedTransaction[] = [];
    const fuzzyMatchedExpenses: Expense[] = [];
    const autoGenMatches: { tx: ParsedTransaction; existing: Expense }[] = [];
    const unique: ParsedTransaction[] = [];

    for (const tx of transactions) {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      const txData = { amount: tx.amount, type: tx.type, date: txDate, description: tx.description, merchant_name: tx.merchant_name };

      let bestScore = 0;
      let bestMatch: Expense | null = null;
      let bestIsAutoGen = false;

      for (const existing of expenses) {
        const { score, isAutoGen } = scoreDuplicate(txData, existing);
        if (score > bestScore || (score === bestScore && isAutoGen && !bestIsAutoGen)) {
          bestScore = score;
          bestMatch = existing;
          bestIsAutoGen = isAutoGen;
        }
      }

      if (bestScore >= 3) {
        // 3/3 = certain duplicate → auto-skip
        duplicates.push(tx);
      } else if (bestScore >= 2 && bestMatch) {
        if (bestIsAutoGen) {
          // 2/3 match against auto-generated → offer replace
          autoGenMatches.push({ tx, existing: bestMatch });
        } else {
          // 2/3 match against normal → fuzzy duplicate for review
          fuzzyDuplicates.push(tx);
          fuzzyMatchedExpenses.push(bestMatch);
        }
      } else {
        unique.push(tx);
      }
    }

    return { duplicates, fuzzyDuplicates, fuzzyMatchedExpenses, autoGenMatches, unique };
  }, [expenses, scoreDuplicate]);


  const checkDuplicate = useCallback((transaction: {
    amount: number;
    description: string;
    date: Date;
    type: string;
    category?: string;
    merchant_name?: string;
  }): Expense | null => {
    const txData = { amount: transaction.amount, type: transaction.type, date: transaction.date, description: transaction.description, merchant_name: transaction.merchant_name };

    let bestScore = 0;
    let bestMatch: Expense | null = null;

    for (const existing of expenses) {
      const { score } = scoreDuplicate(txData, existing);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = existing;
      }
    }

    // Return match if score >= 2 (2-of-3 criteria met)
    return bestScore >= 2 ? bestMatch : null;
  }, [expenses, scoreDuplicate]);

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
