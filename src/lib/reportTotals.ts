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
 * - transfers (incl. inbound ones) count as transfers, never as income
 */
export const computeReportTotals = <T extends ReportTotalsTx>(
  list: T[],
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

/**
 * Keep the top N categories and collapse the remainder into a single
 * "other" row. Input must already be aggregated by display name.
 */
export const topCategoriesWithRest = (
  rows: CategoryRow[],
  topN: number,
  restLabel: string,
): CategoryRow[] => {
  if (rows.length <= topN) return rows.slice();
  const top = rows.slice(0, topN);
  const restAmount = rows.slice(topN).reduce((s, r) => s + r.amount, 0);
  if (restAmount > 0) top.push({ name: restLabel, amount: restAmount });
  return top;
};

/**
 * Strip UUIDs, masked card numbers, long hex chains and trailing numeric
 * references from a raw bank description so report titles stay readable.
 */
export const cleanFeedTitle = (raw: string | undefined | null): string => {
  if (!raw) return '';
  let s = String(raw);
  // Privacy: drop masked card segments ("Kartica: 416598******1542")
  s = s.replace(/\b(kartica|card)\s*:?\s*[0-9*x]{6,}[0-9*x\s-]*/gi, ' ');
  // Drop redundant "Primatelj:" / "Recipient:" tails when a cleaner name exists
  const recipientSplit = s.split(/\b(?:primatelj|primalac|recipient|empfänger)\s*:/i);
  if (recipientSplit.length > 1 && recipientSplit[0].trim().length >= 3) {
    s = recipientSplit[0];
  } else if (recipientSplit.length > 1) {
    s = recipientSplit.slice(1).join(' ');
  }
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '');
  s = s.replace(/\b[0-9a-f]{16,}\b/gi, '');
  s = s.replace(/[,\s]+(?=$|[,\s])/g, ' ');
  s = s.replace(/[\s,–-]+\d{6,}\s*$/g, '');
  s = s.replace(/\s+/g, ' ').replace(/[\s,;:–-]+$/g, '').trim();
  return s;
};

/**
 * Secondary (raw) line under a cleaned merchant name. Returned only when the
 * raw description carries extra information beyond the cleaned title.
 * Card numbers stay stripped for privacy.
 */
export const buildFeedSubtitle = (
  raw: string | undefined | null,
  cleanTitle: string,
): string => {
  if (!raw) return '';
  const masked = String(raw)
    .replace(/\b(kartica|card)\s*:?\s*[0-9*x]{6,}[0-9*x\s-]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:–-]+$/g, '')
    .trim();
  if (!masked) return '';
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  if (norm(masked) === norm(cleanTitle)) return '';
  return masked;
};

// ===== Executive summary (deterministic, template based — no AI) =====

export interface SummaryLargestExpense {
  title: string;
  amount: number;
  date: Date;
}

export interface ExecutiveSummaryInput {
  start: Date;
  end: Date;
  count: number;
  income: number;
  expenses: number;
  net: number;
  categories: CategoryRow[];        // aggregated by name, sorted desc
  largestExpense?: SummaryLargestExpense | null;
}

export interface ExecutiveSummaryFormatters {
  currency: (n: number) => string;
  date: (d: Date) => string;
  percent: (value: number, total: number) => string;
}

export interface ExecutiveSummaryTemplates {
  main: string;              // {{start}} {{end}} {{count}} {{income}} {{expenses}} {{net}}
  categoriesTwo: string;     // {{cat1}} {{pct1}} {{cat2}} {{pct2}}
  categoriesOne: string;     // {{cat1}} {{pct1}}
  largest: string;           // {{title}} {{amount}} {{date}}
  empty: string;
}

const fill = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => (k in vars ? vars[k] : ''));

/**
 * Builds 1-3 purely factual sentences from data already present in the report.
 * Never interpretive, never fetches anything.
 */
export const buildExecutiveSummary = (
  input: ExecutiveSummaryInput,
  f: ExecutiveSummaryFormatters,
  tpl: ExecutiveSummaryTemplates,
): string[] => {
  if (!input.count) return [tpl.empty];

  const sentences: string[] = [
    fill(tpl.main, {
      start: f.date(input.start),
      end: f.date(input.end),
      count: String(input.count),
      income: f.currency(input.income),
      expenses: f.currency(input.expenses),
      net: f.currency(input.net),
    }),
  ];

  const cats = input.categories.filter((c) => c.amount > 0);
  if (cats.length >= 2) {
    sentences.push(fill(tpl.categoriesTwo, {
      cat1: cats[0].name,
      pct1: f.percent(cats[0].amount, input.expenses),
      cat2: cats[1].name,
      pct2: f.percent(cats[1].amount, input.expenses),
    }));
  } else if (cats.length === 1) {
    sentences.push(fill(tpl.categoriesOne, {
      cat1: cats[0].name,
      pct1: f.percent(cats[0].amount, input.expenses),
    }));
  }

  const largest = input.largestExpense;
  if (largest && largest.amount > 0) {
    sentences.push(fill(tpl.largest, {
      title: largest.title,
      amount: f.currency(largest.amount),
      date: f.date(largest.date),
    }));
  }

  return sentences;
};

/** Largest non-correction expense in the list (null when none). */
export const findLargestExpense = <T extends ReportTotalsTx & { description?: string | null; date?: Date }>(
  list: T[],
): T | null => {
  let best: T | null = null;
  for (const e of list) {
    if (isCorrectionTx(e)) continue;
    if (e.type !== 'expense') continue;
    if (!best || e.amount > best.amount) best = e;
  }
  return best;
};

