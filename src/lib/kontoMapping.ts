/**
 * Default category → konto (account) mapping for Synesis export.
 * Users can override these via the UI.
 * Based on Croatian RRF (Računski plan za poduzetnike).
 */

export interface KontoEntry {
  categoryId: string;
  konto: string;
  label: string;
}

// System expense categories
export const DEFAULT_EXPENSE_KONTO: Record<string, { konto: string; label: string }> = {
  food: { konto: '4690', label: 'Troškovi prehrane' },
  groceries: { konto: '4690', label: 'Troškovi prehrane' },
  transport: { konto: '4680', label: 'Troškovi prijevoza' },
  shopping: { konto: '4020', label: 'Utrošeni materijal' },
  entertainment: { konto: '4699', label: 'Ostali troškovi' },
  bills: { konto: '4650', label: 'Komunalne usluge' },
  health: { konto: '4691', label: 'Troškovi zdravstva' },
  utilities: { konto: '4650', label: 'Komunalne usluge' },
  rent: { konto: '4640', label: 'Najamnine' },
  education: { konto: '4670', label: 'Troškovi edukacije' },
  travel: { konto: '4680', label: 'Troškovi službenih putovanja' },
  clothing: { konto: '4699', label: 'Ostali troškovi' },
  beauty: { konto: '4699', label: 'Ostali troškovi' },
  sports: { konto: '4699', label: 'Ostali troškovi' },
  pets: { konto: '4699', label: 'Ostali troškovi' },
  gifts: { konto: '4692', label: 'Reprezentacija' },
  subscriptions: { konto: '4660', label: 'Pretplate i članarine' },
  savings: { konto: '1200', label: 'Štednja' },
  investments: { konto: '1400', label: 'Dugotrajna ulaganja' },
  charity: { konto: '4693', label: 'Donacije' },
  kids: { konto: '4699', label: 'Ostali troškovi' },
  home: { konto: '4630', label: 'Troškovi održavanja' },
  car: { konto: '4681', label: 'Troškovi vozila' },
  insurance: { konto: '4610', label: 'Premije osiguranja' },
  taxes: { konto: '4700', label: 'Porezi i doprinosi' },
  other: { konto: '4699', label: 'Ostali troškovi' },
};

// System income categories
export const DEFAULT_INCOME_KONTO: Record<string, { konto: string; label: string }> = {
  salary: { konto: '7500', label: 'Prihodi od rada' },
  freelance: { konto: '7510', label: 'Prihodi od usluga' },
  gift_income: { konto: '7690', label: 'Ostali prihodi' },
  mortgage: { konto: '7690', label: 'Ostali prihodi' },
  personal_loan: { konto: '7690', label: 'Ostali prihodi' },
  sale: { konto: '7520', label: 'Prihodi od prodaje' },
  other_income: { konto: '7690', label: 'Ostali prihodi' },
};

/**
 * Resolve konto for a category, checking user overrides first.
 */
export const resolveKonto = (
  categoryId: string,
  type: string,
  userOverrides?: Record<string, string>
): { konto: string; label: string } => {
  // Check user overrides first
  if (userOverrides?.[categoryId]) {
    const konto = userOverrides[categoryId];
    const defaults = type === 'income' ? DEFAULT_INCOME_KONTO : DEFAULT_EXPENSE_KONTO;
    const defaultEntry = defaults[categoryId];
    return { konto, label: defaultEntry?.label || 'Prilagođeno' };
  }

  if (type === 'income') {
    return DEFAULT_INCOME_KONTO[categoryId] || { konto: '7690', label: 'Ostali prihodi' };
  }
  return DEFAULT_EXPENSE_KONTO[categoryId] || { konto: '4699', label: 'Ostali troškovi' };
};
