/**
 * Jedno pravilo „stvarni trošak / stvarni prihod" za sve čitače koji zbrajaju.
 *
 * Zrcalo: supabase/functions/_shared/spendClassification.ts — blok između
 * oznaka SHARED CORE mora biti doslovno isti (test u src/lib/__tests__).
 *
 * Upisni putevi (forme, uvoz, sync) i motor salda NE koriste isRealSpend /
 * isRealIncome: korekcija salda mijenja saldo, a ne potrošnju. Za čisti smjer
 * novca (predznak, boja, izbor forme, saldo) koristi se isExpenseType /
 * isIncomeType — ne za zbrajanje potrošnje.
 */
// ---------------- SHARED CORE START ----------------
/** Polja koja pravilo stvarno čita. Ništa drugo se ne nagađa. */
export interface SpendClassificationInput {
  type?: string | null;
  expense_nature?: string | null;
  deleted_at?: string | null;
  /** Rezervirano: stupac još ne postoji u bazi; bez učinka dok je undefined/null. */
  movement_kind?: string | null;
}

/** Vrijednosti expense_nature koje nisu ni trošak ni prihod. */
export const NON_SPENDING_NATURES: readonly string[] = [
  'correction',
  // Rezervirano: vrijednost još ne postoji u bazi.
  'krug_settlement',
];

/** Zajednički dio: redak koji nikad ne ulazi ni u potrošnju ni u prihod. */
export function isExcludedFromSpend(row: SpendClassificationInput | null | undefined): boolean {
  if (!row) return true;
  if (row.type === 'transfer') return true;
  if (row.deleted_at != null) return true;
  if (row.expense_nature != null && NON_SPENDING_NATURES.includes(row.expense_nature)) return true;
  if (row.movement_kind != null) return true;
  return false;
}

export function isRealSpend(row: SpendClassificationInput | null | undefined): boolean {
  return !!row && row.type === 'expense' && !isExcludedFromSpend(row);
}

export function isRealIncome(row: SpendClassificationInput | null | undefined): boolean {
  return !!row && row.type === 'income' && !isExcludedFromSpend(row);
}

/** Samo smjer novca (predznak, boja, forma, saldo). NE za zbrajanje potrošnje. */
export function isExpenseType(row: { type?: string | null } | null | undefined): boolean {
  return !!row && row.type === 'expense';
}

/** Samo smjer novca (predznak, boja, forma, saldo). NE za zbrajanje prihoda. */
export function isIncomeType(row: { type?: string | null } | null | undefined): boolean {
  return !!row && row.type === 'income';
}
// ---------------- SHARED CORE END ----------------
