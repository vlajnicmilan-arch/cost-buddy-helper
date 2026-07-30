// Pure helpers for the transactions PDF/CSV report layer.
// Report-only: never used by the balance engine, import or persistence paths.

export interface ReportTotalsTx {
  type: string;
  amount: number;
  category?: string;
  expense_nature?: string | null;
  income_source_id?: string | null;
}

export interface ReportTotals {
  income: number;
  expenses: number;
  transfers: number;
  balance: number;
}

/** Balance corrections are bookkeeping artifacts, not real income/expense. */
export const isCorrectionTx = (tx: { expense_nature?: string | null }): boolean =>
  tx.expense_nature === 'correction';

/**
 * Report totals for a set of transactions.
 * - corrections are excluded entirely
 * - inbound transfers (income_source_id === sourceId) count as transfers, not income
 */
export const computeReportTotals = <T extends ReportTotalsTx>(
  list: T[],
  sourceId?: string | null,
): ReportTotals => {
  const acc = list.reduce<ReportTotals>(
    (a, e) => {
      if (isCorrectionTx(e)) return a;
      if (e.type === 'income') a.income += e.amount;
      else if (e.type === 'expense') a.expenses += e.amount;
      else if (e.type === 'transfer') a.transfers += e.amount;
      return a;
    },
    { income: 0, expenses: 0, transfers: 0, balance: 0 },
  );
  acc.balance = acc.income - acc.expenses;
  return acc;
};

/** Expense totals per raw category id, corrections excluded. */
export const buildCategoryTotalsById = <T extends ReportTotalsTx>(
  list: T[],
): Record<string, number> => {
  const byCategory: Record<string, number> = {};
  for (const e of list) {
    if (isCorrectionTx(e)) continue;
    if (e.type !== 'expense') continue;
    const key = e.category || 'other';
    byCategory[key] = (byCategory[key] || 0) + e.amount;
  }
  return byCategory;
};

export interface CategoryRow {
  name: string;
  amount: number;
}

/**
 * Collapse category buckets that resolve to the same display name
 * (multiple ids → one "Ostalo" row). Sorted by amount desc.
 */
export const aggregateCategoryTotalsByName = (
  byCategory: Record<string, number>,
  resolveName: (categoryId: string) => string,
): CategoryRow[] => {
  const byName = new Map<string, number>();
  for (const [id, amount] of Object.entries(byCategory)) {
    if (!(amount > 0)) continue;
    const name = resolveName(id);
    byName.set(name, (byName.get(name) || 0) + amount);
  }
  return Array.from(byName.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
};

/** Locale-aware percentage ("82,1%" in hr-HR). */
export const formatPercent = (
  value: number,
  total: number,
  locale = 'hr-HR',
): string => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(pct);
  return `${formatted}%`;
};
