/**
 * Otkud je došao PRVI prikaz popisa transakcija na ovom učitavanju stranice.
 * Čita se samo u `home_ready` dijagnostici (details.expenses_source).
 * Isključivo observacijski — ne mijenja ponašanje.
 */

export type ExpensesSource = 'idb' | 'session' | 'network';

let source: ExpensesSource | null = null;

/** Prvi zapis pobjeđuje — kasniji pozivi ne mijenjaju vrijednost. */
export const markExpensesSource = (value: ExpensesSource): void => {
  if (source === null) source = value;
};

export const getExpensesSource = (): ExpensesSource | null => source;

/** Test-only. */
export const __resetExpensesSourceForTests = (): void => {
  source = null;
};
