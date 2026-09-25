/**
 * Statistika limita po kategorijama unutar jednog budžeta.
 * - Osobni budžet (bez project_id): skupina/list iz registra, najuži limit
 *   pobjeđuje, svaki zapis točno jednom, izuzeta kategorija ne ulazi.
 * - Projektni budžet: staro pravilo, preseljeno bez promjene.
 */
import type { Budget, BudgetCategory, BudgetCategoryWithStats } from '@/types/budget';
import type { Expense } from '@/types/expense';
import { allocateToLimits, countsForPersonalBudget, GroupedCustomCategory } from '@/lib/categoryGroupMatch';

export const MANUAL_ASSIGNED_CATEGORY = '__budget_manual_assigned__';

const statsFor = (cat: BudgetCategory, list: Expense[]): BudgetCategoryWithStats => {
  const spent = list.reduce((s, e) => s + e.amount, 0);
  const percentage = cat.limit_amount > 0 ? (spent / cat.limit_amount) * 100 : 0;
  const originalCategories = [...new Set(
    list.filter((e) => e.category && e.category.toLowerCase() !== cat.category.toLowerCase()).map((e) => e.category),
  )] as string[];
  return {
    ...cat,
    spent,
    remaining: cat.limit_amount - spent,
    percentage,
    isOverBudget: spent > cat.limit_amount,
    isWarning: percentage >= 80 && spent <= cat.limit_amount,
    originalCategories: originalCategories.length > 0 ? originalCategories : undefined,
  };
};

const manualRow = (budgetId: string, list: Expense[]): BudgetCategoryWithStats => ({
  id: `${budgetId}-manual`,
  budget_id: budgetId,
  category: MANUAL_ASSIGNED_CATEGORY,
  limit_amount: 0,
  icon: '📌',
  color: '#6b7280',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  spent: list.reduce((s, e) => s + e.amount, 0),
  remaining: 0,
  percentage: 0,
  isOverBudget: false,
  isWarning: false,
  originalCategories: [...new Set(list.map((e) => e.category).filter(Boolean))] as string[],
});

/** Je li zapis dio ukupne potrošnje budžeta (za projektni budžet sve kao i prije). */
export const countsForBudgetTotal = (budget: Pick<Budget, 'project_id'>, e: Expense): boolean =>
  budget.project_id ? true : countsForPersonalBudget(e);

const legacyMatches = (budgetId: string, e: Expense, cat: BudgetCategory): boolean => {
  const catLower = cat.category.toLowerCase();
  if (e.category === cat.category) return true;
  const categorySynonyms: Record<string, string[]> = {
    transport: ['car', 'auto', 'automobil'],
    food: ['groceries', 'namirnice'],
    bills: ['utilities', 'režije'],
    shopping: ['clothing', 'odjeća'],
    health: ['beauty', 'ljepota', 'sports', 'sport'],
  };
  const synonyms = categorySynonyms[catLower] || [];
  if (synonyms.includes((e.category || '').toLowerCase())) return true;
  if (e.budget_id === budgetId) {
    const descLower = (e.description || '').toLowerCase();
    const merchantLower = (e.merchant_name || '').toLowerCase();
    const categoryKeywords: Record<string, string[]> = {
      rent: ['stanarin', 'najamnin', 'rent ', 'monthly rent'],
      housing: ['stanarin', 'najamnin', 'rent ', 'kuća', 'dom ', 'nekretnin'],
      utilities: ['struja', 'voda', 'plin', 'komunalij', 'rezij', 'internet', 'telefon', 'hep', 'gradska plinara'],
      food: ['hrana', 'namirnic', 'market', 'dućan', 'restoran', 'lidl', 'konzum', 'spar', 'kaufland', 'plodine'],
      transport: ['gorivo', 'benzin', 'bus', 'tramvaj', 'taxi', 'uber', 'bolt', 'ina ', 'petrol', 'tifon', 'auto', 'automobil'],
    };
    const keywords = categoryKeywords[catLower] || [catLower];
    if (keywords.some((kw) => descLower.includes(kw) || merchantLower.includes(kw))) return true;
  }
  return false;
};

/**
 * `periodExpenses` = već filtrirani zapisi razdoblja s budget_id ovog budžeta.
 */
export const computeBudgetCategoryStats = (
  budget: Pick<Budget, 'id' | 'project_id'>,
  budgetCategories: BudgetCategory[],
  periodExpenses: Expense[],
  customs: GroupedCustomCategory[] = [],
): BudgetCategoryWithStats[] => {
  let rows: BudgetCategoryWithStats[];
  if (!budget.project_id) {
    const { perLimit, unassigned } = allocateToLimits(periodExpenses, budgetCategories.map((c) => c.category), customs);
    rows = budgetCategories.map((cat, i) => statsFor(cat, perLimit[i]));
    if (unassigned.length > 0) rows.push(manualRow(budget.id, unassigned));
  } else {
    rows = budgetCategories.map((cat) => statsFor(cat, periodExpenses.filter((e) => legacyMatches(budget.id, e, cat))));
    const unmatched = periodExpenses.filter((e) => e.budget_id === budget.id && !budgetCategories.some((c) => legacyMatches(budget.id, e, c)));
    if (unmatched.length > 0) rows.push(manualRow(budget.id, unmatched));
  }
  rows.sort((a, b) => {
    if (a.limit_amount === 0 && b.limit_amount > 0) return 1;
    if (b.limit_amount === 0 && a.limit_amount > 0) return -1;
    return b.percentage - a.percentage;
  });
  return rows;
};
