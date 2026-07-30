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

// ===== Merchant extraction =====

/** Emoji shortcodes used by mobile payment apps (":moneybag:"). */
const EMOJI_SHORTCODE = /:[a-z_]+:/gi;

/** Masked card prefixes: "462765XXXXXX7262" / "416598******1542". */
const MASKED_CARD = /\b\d{6}[X*x•]{4,}\d{4}\b/g;

const stripEmojiShortcodes = (s: string): string => s.replace(EMOJI_SHORTCODE, ' ');

const tidy = (s: string): string =>
  s
    .replace(/[,\s]+(?=$|[,\s])/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:–-]+/, '')
    .replace(/[\s,;:–-]+$/g, '')
    .trim();

/** Drop UUID / long-hex / long numeric reference tails. */
const stripReferenceTails = (s: string): string => {
  let out = s;
  out = out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ' ');
  out = out.replace(/\b[0-9a-f-]{32,}\b/gi, ' ');
  out = out.replace(/\b[0-9a-f]{16,}\b/gi, ' ');
  out = tidy(out);
  out = out.replace(/[\s,–-]+\d{6,}\s*$/g, '');
  return tidy(out);
};

/** "AIRCASH.EU ZAGREB" → "Aircash.eu Zagreb"; mixed-case input untouched. */
const titleCaseIfShouting = (s: string): string => {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s
    .split(' ')
    .map((w) =>
      // Only the first dotted segment is capitalised ("AIRCASH.EU" → "Aircash.eu")
      w
        .split('.')
        .map((part, i) =>
          !part ? part : i === 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part.toLowerCase(),
        )
        .join('.'),
    )
    .join(' ');
};

const normalizeName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/**
 * KEKS Pay style descriptions:
 * 'KEKS Pay - Vinka P šalje Milan V za "Kava" - 326633655, <uuid>'
 * → "{other party} · {purpose}". The party matching the report owner is
 * dropped; otherwise the sender (first party) is used.
 */
export const parseKeksPay = (
  raw: string,
  owner?: string | null,
): { title: string } | null => {
  const m = raw.match(/keks\s*pay\s*[-–:]\s*(.+?)\s+(?:šalje|salje|sends|sendet)\s+(.+?)(?:\s+za\s+(.+))?$/i);
  if (!m) return null;
  const sender = tidy(stripEmojiShortcodes(m[1]));
  const receiver = tidy(stripReferenceTails(stripEmojiShortcodes(m[2] || '')));
  const purposeRaw = m[3] ? stripReferenceTails(stripEmojiShortcodes(m[3])) : '';
  const purpose = tidy(purposeRaw.replace(/^["'“„]/, '').replace(/["'”“].*$/, ''));

  const o = owner ? normalizeName(owner) : '';
  let other = sender;
  if (o && normalizeName(sender) === o && receiver) other = receiver;

  const title = [other, purpose].filter(Boolean).join(' · ');
  return { title: tidy(title) };
};

/**
 * Strip UUIDs, masked card numbers, long hex chains and trailing numeric
 * references from a raw bank description so report titles stay readable.
 * Manual entries (no bank noise) come back unchanged.
 */
export const cleanFeedTitle = (
  raw: string | undefined | null,
  owner?: string | null,
): string => {
  if (!raw) return '';
  let s = stripEmojiShortcodes(String(raw));

  const keks = parseKeksPay(s, owner);
  if (keks) return keks.title;

  // Privacy: drop masked card segments ("Kartica: 416598******1542")
  s = s.replace(/\b(kartica|card)\s*:?\s*[0-9*x]{6,}[0-9*x\s-]*/gi, ' ');
  // Bare masked card number, typically leading ("462765XXXXXX7262, AIRCASH.EU")
  s = s.replace(MASKED_CARD, ' ');
  // Drop redundant "Primatelj:" / "Recipient:" tails when a cleaner name exists
  const recipientSplit = s.split(/\b(?:primatelj|primalac|recipient|empfänger)\s*:/i);
  if (recipientSplit.length > 1 && recipientSplit[0].trim().length >= 3) {
    s = recipientSplit[0];
  } else if (recipientSplit.length > 1) {
    s = recipientSplit.slice(1).join(' ');
  }
  s = stripReferenceTails(s);
  return titleCaseIfShouting(s);
};

/**
 * Secondary (raw) line under a cleaned merchant name. Returned only when the
 * raw description carries extra information beyond the cleaned title.
 * Card numbers stay stripped for privacy; comparison happens after both
 * sides are cleaned.
 */
export const buildFeedSubtitle = (
  raw: string | undefined | null,
  cleanTitle: string,
): string => {
  if (!raw) return '';
  const masked = tidy(
    stripReferenceTails(
      stripEmojiShortcodes(String(raw))
        .replace(/\b(kartica|card)\s*:?\s*[0-9*x]{6,}[0-9*x\s-]*/gi, ' ')
        .replace(MASKED_CARD, ' '),
    ),
  );
  if (!masked) return '';
  if (normalizeName(masked) === normalizeName(cleanTitle)) return '';
  return masked;
};

// ===== Merchant aggregation (for the interpretive summary sentence) =====

export interface MerchantRow {
  name: string;
  amount: number;
}

/**
 * Sum amounts per extracted merchant name, biggest first.
 * Entries without a usable merchant name are ignored.
 */
export const aggregateMerchants = (
  items: { title: string; amount: number }[],
): MerchantRow[] => {
  const byName = new Map<string, number>();
  const displayNames = new Map<string, string>();
  for (const it of items) {
    const name = tidy(it.title || '');
    if (!name || name === '—') continue;
    if (!(it.amount > 0)) continue;
    const key = normalizeName(name);
    const prev = byName.get(key);
    byName.set(key, (prev || 0) + it.amount);
    if (!prev) displayNames.set(key, name);
  }
  return Array.from(byName.entries())
    .map(([key, amount]) => ({ name: displayNames.get(key) || key, amount }))
    .sort((a, b) => b.amount - a.amount);
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
  /** Merchants inside the biggest expense category, sorted desc. */
  topCategoryMerchants?: MerchantRow[];
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
  merchantsTwo?: string;     // {{cat}} {{m1}} {{m2}}
  merchantsOne?: string;     // {{cat}} {{m1}}
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

  // Interpretive-but-factual sentence: merchants inside the biggest category.
  const merchants = (input.topCategoryMerchants || []).filter((m) => m.amount > 0);
  if (cats.length >= 1 && merchants.length >= 1) {
    if (merchants.length >= 2 && tpl.merchantsTwo) {
      sentences.push(fill(tpl.merchantsTwo, {
        cat: cats[0].name,
        m1: merchants[0].name,
        m2: merchants[1].name,
      }));
    } else if (tpl.merchantsOne) {
      sentences.push(fill(tpl.merchantsOne, {
        cat: cats[0].name,
        m1: merchants[0].name,
      }));
    }
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

