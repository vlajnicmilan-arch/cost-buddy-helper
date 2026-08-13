/**
 * Teška polja transakcije koja se NE dohvaćaju u listi (vidi
 * `src/lib/expenseColumns.ts`), nego lijeno u detalju, po id-u.
 */
export interface ExpenseHeavyFields {
  bank_raw_line?: string | null;
  bank_raw_line_source?: string | null;
  location_name?: string | null;
}

/**
 * Spaja lijeno dohvaćena teška polja na expense redak iz liste.
 *
 * Pravilo: vrijednost s retka (npr. optimistički upis ili stari keš koji je
 * još nosio puna polja) ima prednost; lijeni dohvat samo popunjava praznine.
 * Time citat "Kako piše na izvodu" radi identično kao prije.
 */
export function mergeHeavyFields<T extends ExpenseHeavyFields>(
  row: T | null | undefined,
  heavy: ExpenseHeavyFields | null | undefined,
): T | null {
  if (!row) return null;
  if (!heavy) return row;
  return {
    ...row,
    bank_raw_line: row.bank_raw_line ?? heavy.bank_raw_line ?? null,
    bank_raw_line_source: row.bank_raw_line_source ?? heavy.bank_raw_line_source ?? null,
    location_name: (row as ExpenseHeavyFields).location_name ?? heavy.location_name ?? null,
  };
}
